#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1197-meal-body.js — 식사 = 몸이 꺼내 먹음 · 굶어 죽음 = 그 몸 (T1197 · 추상 걷기 C) ==========================
//
// ★무엇을 보나
//   ① 유도값 — 배부른 띠 · 죽음 날 수는 몸 정본(`server/body.js`)을 굴려 얻는다(새 수 0) · 제 몫을 다 먹는 사람은 하루 정확히 하루치(`DAILY_FOOD_CONSUMPTION`)를 먹는다.
//   ② 굶어 죽음 = HP 0 인 **그 사람**(가장 늙은 이가 아니다) · 하루 상한 없음 · 보호막이 막는다 · 다시 먹으면 갚기(상한 `FD_REPAY_MAX`)로 띠에 돌아온다.
//   ③ 끔(`T1197_MEAL_BODY=0`) = 칸이 안 선다(T1074 그대로 — 아이 프로세스).
//   ④ 두 길이 같다(T1185 질문 3) — 몸 길(틱마다 `t1197Advance` · 끼니 문 `t1197Meal`) ↔ 일괄 길(날 경계 `t1197Day`) — 게이지 · HP · 곳간이 같다.
//   ⑤ 호스트 — 몸이 그 사람과 짝 · 흘림이 몸 허기에 비친다 · 끼니가 곳간에서 꺼낸다(한 끼 한 번) · 날 경계에 HP 0 으로 빠진 그 사람의 몸이 쓰러진다(명부 맨 앞 몸이 아니다).
//   ⑥ 자명 통과 금지 — 일괄 길에서 끼니 하나를 건너뛴 사본은 ④ 가 잡는다 · 맨 앞 몸을 쓰러뜨리는 사본은 ⑤ 가 잡는다.
//
// 실행: node scripts/test-t1197-meal-body.js   (존 안 띄움 · 몇 초)
'use strict';
// ★[PM land1049] `T1195_HUNT_REAL` · `T1197_MEAL_BODY`(+ T1198) 끔 기본으로(켬 판 서버 빈 마을 1 → 15 · 켤 날 T1209) — 이 하네스는 켬 판의 일을 잰다 → 켬에 묶는다(기본값 줄만 끔 기본으로).
if (process.env.T1197_MEAL_BODY == null) process.env.T1197_MEAL_BODY = '1';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';

if (process.argv[2] === '--child-off') {
  const E = R('sim/economy-sim');
  const v = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 6, name: '끔촌' });
  for (let d = 1; d <= 5; d++) E.tickVillage(v, d);
  console.log(JSON.stringify({ knob: E.T1197_MEAL_BODY, m: E.__t1197(), mh: v.npcs.some((p) => p._mh != null), die: E.t1197DieDays() }));
  process.exit(0);
}

if (process.argv[2] === '--child-shield') {   // 보호막이 선 판(`T858_NO_SHIELD=0`) — 첫 365일 NPC 마을
  const E = R('sim/economy-sim'), M = E.__t1197();
  const v = E.createVillage({ fertility: 0, water: 0, stone: 0, ore: 0, wood: 0, game: 0, size: 60, arable: 0, initialPop: 4, name: '막촌' });
  v.founder = false; v._bornDay = 0;
  for (const p of v.npcs) { p._mh = M.fed[0]; p._mhp = 1; p._mD = 0; p._mS = -1; }
  for (const r of Object.keys(v.storage)) v.storage[r] = 0;
  E.tickVillage(v, 1);
  console.log(JSON.stringify({ n: v.npcs.length, shield: v._fdShield || 0, hp0: v.npcs.filter((p) => p._mhp <= 0).length }));
  process.exit(0);
}
const E = R('sim/economy-sim');
const B = R('server/body');
const K = R('server/kcal');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const mkV = (n, food, o) => { const v = Object.assign({ id: 9, npcs: [], storage: { food, fish: 0, meat: 0, cooked_food: 0 }, counts: { farmer: n }, founder: true }, o || {}); for (let i = 0; i < n; i++) v.npcs.push({ id: 'n9.' + (i + 1), age: 20 + i, currentJob: 'farmer' }); return v; };

console.log('\n=== T1197 ① 유도값 · 제 몫 ===');
const M = E.__t1197();
ok(E.T1197_MEAL_BODY === true && !!M, '켬(하네스가 켬에 묶음 · 제품은 끔 기본) — 몸 정본 · kcal 을 읽었다');
ok(M && M.DH === K.dayHunger() && M.HS === B.CFG.HUNGER_SEC && near(M.AT, 100 * (1 - B.extremeAt('hunger')), 1e-12), '하루 허기 · 감쇠 · 극단 문턱 = 정본 그 수', M && JSON.stringify({ DH: M.DH, HS: M.HS, AT: +M.AT.toFixed(3) }));
ok(M && M.fed[0] > M.AT && M.fed[1] > M.AT && M.fed[0] < 100, '배부른 띠는 극단 밖', M && JSON.stringify(M.fed.map((x) => +x.toFixed(3))));
ok(M && M.dieDays > 1 && M.dieDays < 14, '죽음 날 수 = 몸 정본 유도(허기 극단 3 게임일 + 게이지 몫)', M && M.dieDays.toFixed(3));
{
  const v = mkV(10, 1000);
  for (let d = 1; d <= 30; d++) E.t1197Day(v, d);
  ok(near(1000 - v.storage.food, 300, 1e-6), '배부른 열 사람 30일 = 정확히 300 하루치(제 몫 = 하루치 1)', (1000 - v.storage.food).toFixed(6));
  ok(v.npcs.every((p) => p._mhp === 100 && p._fd === 0 && near(p._mh, M.fed[0], 1e-6)), '배부른 사람 — HP 100 · 빚 0 · 날 머리 허기 = 띠');
}

console.log('\n=== T1197 ② 굶어 죽음 = 그 사람 ===');
{
  // 곳간 0 · 셋: 늙은이(HP 100) · 젊은이 둘(HP 40 · 100) — 먼저 죽는 사람 = HP 가 먼저 바닥난 젊은이(가장 늙은 이가 아니다)
  const v = mkV(3, 0); const [a, b, c] = v.npcs; a.age = 70; b.age = 20; c.age = 21;
  for (const p of v.npcs) { p._mh = M.fed[0]; p._mhp = 100; p._mD = 0; p._mS = -1; } b._mhp = 40;
  let firstDead = null, day = 0;
  for (let d = 1; d <= 8 && !firstDead; d++) { E.t1197Day(v, d); day = d; const z = v.npcs.find((p) => p._mhp <= 0); if (z) firstDead = z; }
  ok(firstDead === b, 'HP 가 먼저 바닥난 그 사람(젊은이)이 먼저 — 가장 늙은 이 아님', firstDead && firstDead.id + ' 날 ' + day);
  ok(a._mhp > 0, '늙은이는 그날 아직 산다', a._mhp.toFixed(2));
}
{
  // tickVillage 의 죽음 자리 — 보호막이 끝난 마을 · 곳간 0 · 다섯 다 같은 날 바닥 → 그날 다섯(하루 상한 1 아님 · POP_MIN 0)
  const v = E.createVillage({ fertility: 0, water: 0, stone: 0, ore: 0, wood: 0, game: 0, size: 60, arable: 0, initialPop: 5, name: '굶촌' });
  v.founder = true;   // 보호막 밖(founder = 플레이어 마을 문법 — 첫 365일 NPC 보호막이 안 선다)
  for (const p of v.npcs) { p._mh = M.fed[0]; p._mhp = 1; p._mD = 0; p._mS = -1; }
  for (const r of Object.keys(v.storage)) v.storage[r] = 0;
  const n0 = v.npcs.length, d0 = v._fdDeadTot || 0;
  E.tickVillage(v, 1);
  ok(v.npcs.length === 0 && (v._fdDeadTot || 0) - d0 === n0, '그날 HP 0 이 된 다섯이 그날 다 — 하루 상한 없음', `${n0} → ${v.npcs.length} · 굶어 죽음 ${(v._fdDeadTot || 0) - d0}`);
  ok(Array.isArray(v._t1197Dead) && v._t1197Dead.length === n0, '그 사람들의 id 가 호스트 목록에 선다(몸이 그 사람으로 쓰러진다)', JSON.stringify(v._t1197Dead));
}
{
  const out = JSON.parse(execFileSync(process.execPath, [__filename, '--child-shield'], { env: Object.assign({}, process.env, { T858_NO_SHIELD: '0' }), encoding: 'utf8' }).trim().split('\n').pop());
  ok(out.n === 4 && out.shield === 4 && out.hp0 === 4, '보호막(`T858_NO_SHIELD=0` 판 · 첫 365일 NPC 마을) — HP 0 이어도 아무도 안 빠지고 막은 수만 센다', JSON.stringify(out));
}
{
  // 다시 먹으면 — 갚기 상한 안에서 띠로 돌아온다 · 빚 거울이 HP 몫까지 줄어든다
  const v = mkV(1, 0); const p = v.npcs[0];
  for (let d = 1; d <= 2; d++) E.t1197Day(v, d);
  const fdLow = p._fd, hpLow = p._mhp;
  v.storage.food = 100; const f0 = v.storage.food;
  E.t1197Day(v, 3);
  const ate = f0 - v.storage.food;
  ok(ate > 1 && ate <= 1 + E.__t1074.FD_REPAY_MAX + 1e-9, '다시 먹는 날 — 하루치 + 갚기(상한 `FD_REPAY_MAX`) 안', `${ate.toFixed(4)} ≤ ${(1 + E.__t1074.FD_REPAY_MAX).toFixed(4)}`);
  for (let d = 4; d <= 12; d++) E.t1197Day(v, d);
  ok(near(p._mh, M.fed[0], 1e-3) && p._mhp > hpLow && p._fd < fdLow, '띠로 돌아오고 HP 가 오른다(극단 밖 하루 회복) · 빚 거울이 준다', JSON.stringify({ h: +p._mh.toFixed(3), hp: +p._mhp.toFixed(2), fd: +p._fd.toFixed(3), fdLow: +fdLow.toFixed(3) }));
}

console.log('\n=== T1197 ③ 끔 ===');
{
  const out = JSON.parse(execFileSync(process.execPath, [__filename, '--child-off'], { env: Object.assign({}, process.env, { T1197_MEAL_BODY: '0' }), encoding: 'utf8' }).trim().split('\n').pop());
  ok(out.knob === false && out.m === null && out.mh === false && out.die === 14, '`T1197_MEAL_BODY=0` — 칸 0 · 죽음 날 14(T1074 그대로)', JSON.stringify(out));
}

console.log('\n=== T1197 ④ 몸 길 = 일괄 길 ===');
function twoPaths(foodByDay, skip) {
  const A = mkV(3, 0), Bv = mkV(3, 0);
  const tick = 1 / 1440;   // 몸 틱 — 게임 1분(운영 30Hz 보다 굵다 · 같은 함수)
  for (let d = 0; d < foodByDay.length; d++) {
    A.storage.food += foodByDay[d]; Bv.storage.food += foodByDay[d];
    // 몸 길: 날 d 안에서 틱마다 흘리고, 아침(d+0) · 저녁(d+R) 끼니 문에서 먹는다
    for (let t = d; t < d + 1 - 1e-12; t += tick) {
      const tt = Math.min(d + 1, t + tick);
      for (const p of Bv.npcs) E.t1197Advance(p, tt);
      for (const k of [0, 1]) {
        const at = d + (k ? M.R : 0);
        if (t <= at && at < tt + 1e-12) { for (const p of Bv.npcs) { E.t1197Advance(p, at); if (p._mS < d * 2 + k && !(skip && k === 1)) E.t1197Meal(Bv, [p], d * 2 + k, true); } }
      }
    }
    E.t1197Day(A, d + 1); E.t1197Day(Bv, d + 1);
  }
  return { A, B: Bv };
}
{
  const food = [3, 3, 0, 0, 0, 1, 6, 3, 3, 0, 2, 3, 3, 3];
  const { A, B: Bv } = twoPaths(food, false);
  const dh = Math.max(...A.npcs.map((p, i) => Math.abs(p._mh - Bv.npcs[i]._mh)));
  const dp = Math.max(...A.npcs.map((p, i) => Math.abs(p._mhp - Bv.npcs[i]._mhp)));
  const ds = Math.abs(A.storage.food - Bv.storage.food);
  ok(dh < 0.05 && dp < 0.05 && ds < 1e-6, '14일(굶는 날 포함) — 허기 · HP · 곳간이 같다(몸 틱 1분 · 일괄 1시간 걸음 차만)', JSON.stringify({ dh: +dh.toExponential(2), dp: +dp.toExponential(2), ds: +ds.toExponential(2), hpA: +A.npcs[0]._mhp.toFixed(3), hpB: +Bv.npcs[0]._mhp.toFixed(3) }));
  const sk = twoPaths(food, true);
  const dh2 = Math.max(...sk.A.npcs.map((p, i) => Math.abs(p._mh - sk.B.npcs[i]._mh))) + Math.abs(sk.A.storage.food - sk.B.storage.food);
  ok(dh2 > 0.1, '[자명 통과 금지] 몸 길이 저녁 끼니를 건너뛴 사본은 갈린다', dh2.toFixed(3));
}

console.log('\n=== T1197 ⑤ 호스트(몸 문) ===');
{
  const V = R('server/villages');
  const players = new Map(), npcs = new Set(), bcast = []; let pid = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'b' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {} }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: 64, corpseMs: 300000, deathDrop: () => 0,
    setHp: require('./lib-hp-door').makeSetHp((m) => bcast.push(m)),
  };
  const e = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 4, name: '목촌' });
  const SZ = 32, C = { cx: 200, cy: 200 };
  const vil = { dbId: 1, name: '목촌', ccx: C.cx, ccy: C.cy, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (C.cx - 6 + i * 4) * SZ + 16, y: (C.cy + 8) * SZ + 16 })), _maxRPx: 40 * SZ };
  const W = { day: 400, seed: 7 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [vil], byDbId: new Map([[1, vil]]), byEcon: new Map([[e, vil]]), world: W, routeCache: new Map(), _route: null, _distCtx: null, roads: null, epoch: 0, dayMs: 30000, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0 });
  H.syncVillagePop(vil, Infinity); H.syncVillagePop(vil, 2);
  ok(H._t1197On() && vil.npcPids.length === 4, '목 세계 — 몸 넷 · 켬', vil.npcPids.length);
  const bodies = vil.npcPids.map((id) => players.get(id));
  const persons = bodies.map((b) => H._t1197Person(vil, b));
  ok(persons.every(Boolean) && new Set(persons.map((q) => q.id)).size === 4, '몸마다 짝 — 서로 다른 사람 넷', persons.map((q) => q && q.id).join(','));
  ok(bodies.every((b, i) => b._econId === persons[i].id) && H._t1197Person(vil, bodies[0]) === persons[0], '짝은 몸 칸(`_econId`)에 선다 · 다시 물어도 같은 사람');
  const t0 = H.econDayToMs(W.day) + 1;
  const sid = (k) => W.day * 2 + k;
  for (const q of persons) { q._mh = M.fed[0]; q._mhp = 100; q._mD = W.day; q._mS = sid(0) - 1; }
  bodies[0].hunger = 100;
  const stepOk = H.t1197BodyStep(bodies[0], t0 + 3000);
  ok(stepOk === true && near(bodies[0].hunger, persons[0]._mh, 1e-12) && persons[0]._mh < M.fed[0], '흘림 — 몸 허기 = 그 사람 게이지(존이 100 으로 채우지 않는다)', `${bodies[0].hunger.toFixed(3)} < ${M.fed[0].toFixed(3)}`);
  { const q1 = persons[1], h0 = q1._mh, d0 = q1._mD; const r = H.t1197BodyStep(bodies[1], t0 + 9000, false);
    ok(r === false && q1._mh === h0 && q1._mD === d0, '안 보이는 몸(활성 칸 밖) — 몸 길을 안 탄다 · 그 사람은 날 경계 일괄(벽시계 무관 — 헤드리스 판 결정론)'); }
  for (const r of Object.keys(e.storage)) if (r !== 'food') e.storage[r] = 0;
  e.storage.food = 50; const f0 = e.storage.food;
  const ate = H._t1197BodyMeal(vil, bodies[0], 0, t0 + 3000);
  const took = f0 - e.storage.food;
  ok(ate === true && took > 0.5 && took < 1.2 && persons[0]._mS === sid(0) && bodies[0]._lifeAct === '식사', '아침 끼니 — 곳간에서 꺼내 먹었다(그 사람 몫 · 라벨 식사)', took.toFixed(4));
  ok(H._t1197BodyMeal(vil, bodies[0], 0, t0 + 4000) === false && f0 - e.storage.food === took, '같은 끼니 두 번 0');
  ok(e._t1197Body && near(Object.values(e._t1197Body).reduce((a, x) => a + x, 0), took, 1e-9), '몸 끼니는 다음 날 경계 식단에 든다(기록 대기)', JSON.stringify(e._t1197Body));
  // 날 경계 — 몸이 이미 먹은 아침은 건너뛰고 저녁만 친다
  const f1 = e.storage.food;
  E.t1197Day(e, W.day + 1);
  const batch = f1 - e.storage.food;
  ok(persons[0]._mS === sid(1) && batch > 0, '날 경계 — 남은 끼니만(몸이 먹은 아침은 건너뜀)', batch.toFixed(4));
  // 굶어 죽은 그 사람 — 명부 맨 앞이 아닌 셋째 몸의 사람
  const victim = persons[2], vb = bodies[2];
  e._t1197Dead = null; E.t1197Kill(e, victim, false);
  const front = vil.npcPids[0], b0 = bcast.length;
  H.syncVillagePop(vil, 2);
  const downs = bcast.slice(b0).filter((m) => m && m.type === 'player_down_state' && m.isDown).map((m) => m.pid);
  ok(downs.length === 1 && downs[0] === vb.pid && vil.npcPids.indexOf(vb.pid) < 0 && vil.npcPids[0] === front, '날 경계 — 그 사람의 몸이 쓰러진다(맨 앞 몸 아님)', JSON.stringify({ down: downs, victim: vb.pid, front }));
  ok(H._t1197Stat.bodyDied === 1 && H.bodyExitStats && vb.hp === 0, '몸 죽음 셈 · 그 몸 HP 0(T590 ⓐ 문)', JSON.stringify(H._t1197Stat));
}

console.log('\n=== T1197 ⑥ 비용(µs · 판정 0) ===');
{
  const v = mkV(200, 1e6);
  for (let d = 1; d <= 3; d++) E.t1197Day(v, d);
  let t = process.hrtime.bigint(); for (let d = 4; d <= 53; d++) E.t1197Day(v, d); const dayUs = Number(process.hrtime.bigint() - t) / 1e3 / (50 * 200);
  const q = v.npcs[0]; let x = 53; t = process.hrtime.bigint(); for (let i = 0; i < 200000; i++) { x += 1 / 43200; E.t1197Advance(q, x); } const stepUs = Number(process.hrtime.bigint() - t) / 1e3 / 200000;
  console.log(`    일괄 하루 ${dayUs.toFixed(3)} µs/사람 · 몸 흘림 한 틱 ${stepUs.toFixed(3)} µs/사람(배부른 띠 · 30Hz)`);
  ok(dayUs > 0 && stepUs > 0, '잼(판정 0 — 보고 표)');
}

console.log(`\n=== T1197 결과: ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
