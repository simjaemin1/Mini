#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-body-seed-restart.js — 마을 몸 주사위 신원(`_sh`) · 다시 뜬 판 (T822 · T833) ======================================
//
// ★왜 [T833 ② · T822 회부 1] 마을 몸 주사위 신원 `_sh` = 판 씨 + (마을 · 몸 번호). T822 의 몸 번호 `pid`(`p<연번>`)는 존 연번이라
//   프로세스가 다시 뜨면 1 부터 다시 센다 — T747 이 되살린 몸의 옛 `pid` 열쇠와 다시 뜬 뒤 선 몸의 열쇠가 같은 마을에서 겹쳤다(같은 `_sh`).
//   T833: 몸 번호 = **명부 자리**(마을 `npcPids` 의 차례 — T747 이 다시 뜬 몸을 짚는 그 열쇠) · 명부가 바뀌는 자리마다 다시 굽는다(`_t822Rekey`).
//
// ★포트 0: 존을 안 띄운다 — 운영 함수(`villages.__p3Bind` — test-body-exit 와 같은 문)를 목 세계 위에서 부른다(사본 0).
//   "다시 뜸" = 저장 줄(`serializeEcon` → 글자) → 모듈을 **새로 적재**(마을 상태 · 몸 계수기가 1 부터 — 존 `nextPid = 1` 흉내) →
//   econ 되살림(`restoreEcon`) → 부팅 출생 동기(`syncVillagePop(∞)`) → T747 몸 칸 되살림(`_t747Restore`) → `_t833Boot` — init 의 그 차례(⑥ 이 글자로 본다).
//   ① 손잡이 기본 켬(env 없는 자식) · `=0` 끔
//   ② 한 판 — 출생 · 늙어 죽음(맨 앞) · 떠남(맨 뒤 · 도적 · 이탈) · 전사(가운데 · `_warDespawnPid`) 동기마다: 명부 몸 `_sh` = 그 자리 열쇠 · 존 전체 겹침 0
//   ③ 다시 뜬 판 — 되살린 몸 = 다시 뜨기 전 그 자리 열쇠(이어짐) · 겹침 0
//   ④ 다시 뜬 뒤 출생 · 죽음 — 겹침 0 · ★자명 통과 금지: 같은 판을 T822 열쇠(`pid`)로 셌다면 겹쳤을 짝(같은 마을 · 되살린 몸의 옛 `pid` = 새 몸의 `pid`)이 > 0
//   ⑤ 끔(`=0`) — 이 문들이 `_sh` 를 안 굽는다(종전 글자 길 — 존 `_shOf` 가 첫 결정에서 꼬리로 굽는다)
//   ⑥ 린트 — villages.js 에서 명부를 바꾸는 줄(push · splice · 다시 대입)마다 `_t822Rekey` 가 같은 줄 · 다음 줄에 있다 · init 의 `_t747Restore` 뒤에 `_t833Boot`
//   판 씨 갈래: econ 세계 씨(`rngState().s0`)가 있으면 그것 · 없으면 `state.villageSeed` — ② 에서 둘 다 본다.
// 실행: node scripts/test-body-seed-restart.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SZ = 32;
const SEED = 1020;

function load(env) {   // 새 프로세스 흉내 — server/ · sim/ 모듈을 새로 적재(마을 상태 · 몸 계수기 · 손잡이 상수)
  for (const k of Object.keys(require.cache)) if (k.indexOf(path.join(ROOT, 'server')) === 0 || k.indexOf(path.join(ROOT, 'sim')) === 0) delete require.cache[k];
  for (const k of Object.keys(env || {})) { if (env[k] == null) delete process.env[k]; else process.env[k] = env[k]; }
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  return { econ: require(path.join(ROOT, 'sim', 'economy-sim')), V: require(path.join(ROOT, 'server', 'villages')) };
}
const NAMES = ['갑촌', '을촌', '병촌'];
// 목 세계 — 마을 셋(집 넷씩) · econ 마을(운영 econ 정본 `createVillage`) · 몸 계수기 = 이 적재의 것(존 `p${nextPid++}` 꼴 · 1 부터)
function world(M, econs) {
  const players = new Map(), npcs = new Set(), bcast = [];
  let n = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'p' + (n++); const p = { pid: id, playerId: `npc_t833_${n}_tail`, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {},
      tribeId: q.villageId || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY }; players.set(id, p); npcs.add(id); return p; },
    bump: (k) => { n += k; },   // 마을 몸 밖에서 계수기를 쓰는 몸(캐러밴 · 도적 · 손님) 흉내 — 번호에 틈을 낸다
    isTerrainBlockedLocal: () => false, moveSpeed: 64, corpseMs: 300000, deathDrop: () => 0,
  };
  const vils = NAMES.map((name, i) => {
    const e = econs ? econs[i] : M.econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 6 + i * 2, name });
    const C = { cx: 200 + i * 120, cy: 200 };
    const housesPx = [0, 1, 2, 3].map((h) => ({ x: (C.cx - 6 + h * 4) * SZ + SZ / 2, y: (C.cy + 8) * SZ + SZ / 2 }));
    return { dbId: i + 1, name, ccx: C.cx, ccy: C.cy, econ: e, npcPids: [], housesPx, _maxRPx: 40 * SZ };
  });
  const W = { day: 400, seed: 7 };
  const H = M.V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])),
    world: W, routeCache: new Map(), _route: null, _distCtx: null, roads: null, villageSeed: SEED, econ: undefined,
    epoch: 0, dayMs: 30000, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
  });
  return { H, vils, players, npcs, bcast, deps };
}
const keyOf = (s0, dbId, i, pidHash) => pidHash(`${s0}_simvil_${dbId}_${i}`);   // 기대값 — 운영 글자와 같은지는 ② 가 운영 함수로 굽은 값과 맞대어 본다
function census(T, s0, pidHash) {   // 명부 몸 — 자리 열쇠 어긋남 · 존 전체 겹침
  let n = 0, off = 0, undef = 0; const seen = new Map(); let dup = 0;
  for (const vil of T.vils) for (let i = 0; i < vil.npcPids.length; i++) {
    const b = T.players.get(vil.npcPids[i]); if (!b) continue; n++;
    if (b._sh === undefined) { undef++; continue; }
    if (b._sh !== keyOf(s0, vil.dbId, i, pidHash)) off++;
    if (seen.has(b._sh)) dup++; else seen.set(b._sh, b.pid);
  }
  return { n, off, undef, dup };
}
function econDeaths(e, k) { e._dpDebug = Object.assign({}, e._dpDebug || {}, { hunger: 0.2 }); for (let i = 0; i < k; i++) { e.npcs.splice(0, 1); e._deadTot = (e._deadTot || 0) + 1; } }
function econBirths(e, k) { for (let i = 0; i < k; i++) e.npcs.push(Object.assign({}, e.npcs[e.npcs.length - 1] || {}, { id: 'e' + (e._t833n = (e._t833n || 0) + 1), age: 0 })); }
function econLeave(e, k) { for (let i = 0; i < k; i++) e.npcs.pop(); }

console.log('\n=== T822 · T833 — 마을 몸 주사위 신원 · 다시 뜬 판 ===');

// ── ① 손잡이 기본 ─────────────────────────────────────────────────────────────────────────
{
  const env = Object.assign({}, process.env); delete env.T822_BODY_SEED;
  const rd = (e) => execFileSync(process.execPath, ['-e', "process.stdout.write(String(require('./server/villages.js').__p3Bind({}).T822_BODY_SEED))"], { cwd: ROOT, env: e }).toString();
  const on = rd(env), off = rd(Object.assign({}, env, { T822_BODY_SEED: '0' }));
  ok(on === 'true' && off === 'false', '① 손잡이 기본 켬(env 없는 자식 · PM 10-21) · `T822_BODY_SEED=0` 끔', `${on} · ${off}`);
}

// ── ② 한 판 — 명부가 바뀔 때마다 자리 열쇠 · 겹침 0 ─────────────────────────────────────────
let M = load({ T822_BODY_SEED: null });
const PH = require(path.join(ROOT, 'server', 'seed-rand.js')).pidHash;
let T = world(M);
const S1 = [];
for (const vil of T.vils) T.H.syncVillagePop(vil, Infinity);
for (const vil of T.vils) T.H.syncVillagePop(vil, 2);   // 첫 관측(기준만 심는다 — 까닭 0)
{
  const c = census(T, SEED, PH);
  ok(c.n > 0 && c.undef === 0 && c.off === 0 && c.dup === 0, '② 부팅 출생 — 명부 몸 다 자리 열쇠(판 씨 = villageSeed 갈래) · 겹침 0', `몸 ${c.n}`);
}
//   스무 바퀴 — 바퀴마다 마을마다: 출생 · 늙어 죽음(맨 앞) · 떠남(맨 뒤) · 전사(가운데) 를 돌려 가며 · 사이에 계수기 틈(캐러밴 · 도적 몫)
const tally = { births: 0, died: 0, walked: 0, killed: 0 };
let worstOff = 0, worstDup = 0, bodiesMax = 0;
for (let r = 0; r < 20; r++) {
  for (const vil of T.vils) {
    const e = vil.econ, k = (r + vil.dbId) % 4;
    if (k === 0) { econBirths(e, 3); tally.births += 3; }
    else if (k === 1) { econDeaths(e, 2); tally.died += 2; econBirths(e, 1); }
    else if (k === 2) { T.H.noteBodyExit(vil, 'desert', 1); econLeave(e, 1); tally.walked += 1; econBirths(e, 2); }
    else { const mid = vil.npcPids[Math.floor(vil.npcPids.length / 2)]; if (mid) { T.H._warDespawnPid(mid); e.npcs.splice(Math.floor(e.npcs.length / 2), 1); tally.killed += 1; } econBirths(e, 2); }
    T.deps.bump(1 + (r % 3));
    T.H.syncVillagePop(vil, 2);
    const c = census(T, SEED, PH); worstOff = Math.max(worstOff, c.off + c.undef); worstDup = Math.max(worstDup, c.dup); bodiesMax = Math.max(bodiesMax, c.n);
  }
}
ok(tally.died > 0 && tally.walked > 0 && tally.killed > 0 && tally.births > 0, '② 판이 명부 문을 다 지났다(출생 · 늙어 죽음 · 떠남 · 전사)', JSON.stringify(tally));
ok(worstOff === 0, '② 동기마다 명부 몸의 `_sh` = 그 자리 열쇠(`_t822Rekey` — 줄어든 자리부터 다시 굽는다)', `어긋남 최대 ${worstOff} · 몸 최대 ${bodiesMax}`);
ok(worstDup === 0, '② 동기마다 존 전체 겹침 0', `겹침 최대 ${worstDup}`);
//   판 씨 갈래 — econ 세계 씨가 있으면 그것(운영 · T731 켬)
{
  const vil = T.vils[0], st = T.H.state, keep = st.econ;
  st.econ = { rngState: () => ({ seed: 1, npc: 1, vil: 1, s0: 4242 }) };
  T.H._t822Rekey(vil, 0);
  const b = T.players.get(vil.npcPids[0]);
  ok(b && b._sh === keyOf(4242, vil.dbId, 0, PH) && b._sh !== keyOf(SEED, vil.dbId, 0, PH), '② 판 씨 = econ `rngState().s0`(있으면) — villageSeed 보다 먼저');
  st.econ = keep; T.H._t822Rekey(vil, 0);
}

// ── ③ 다시 뜬 판 — 저장 줄 → 새 적재 → 되살림 ───────────────────────────────────────────────
const before = T.vils.map((vil) => vil.npcPids.map((pid) => { const b = T.players.get(pid); return { pid, sh: b._sh }; }));
const saved = T.vils.map((vil) => T.H.serializeEcon(vil.econ));
const hasRows = saved.every((s) => { const o = JSON.parse(s); return o._t747Body && Array.isArray(o._t747Body.rows) && o._t747Body.rows.length > 0; });
ok(hasRows, '③ 저장 줄에 T747 몸 칸(명부 자리마다 · `_sh` 포함)이 든다', saved.map((s) => JSON.parse(s)._t747Body.rows.length).join(' · '));
const maxOldPid = Math.max(...before.flat().map((x) => +x.pid.slice(1)));
M = load({ T822_BODY_SEED: null });
const econs = saved.map((s) => M.V.__p3Bind({}).restoreEcon(s, M.econ));
T = world(M, econs);
for (const vil of T.vils) T.H.syncVillagePop(vil, Infinity);   // init Stage 2 — 부팅 출생(새 계수기 1 부터)
T.H._t747Restore();                                             // init — T747 몸 칸 되살림
T.H._t833Boot();                                                // init — 되살림 뒤 한 번
{
  let same = 0, rows = 0;
  for (let v = 0; v < T.vils.length; v++) { const vil = T.vils[v]; for (let i = 0; i < Math.min(vil.npcPids.length, before[v].length); i++) { rows++; if (T.players.get(vil.npcPids[i])._sh === before[v][i].sh) same++; } }
  const c = census(T, SEED, PH);
  ok(rows > 0 && same === rows, '③ 되살린 몸 = 다시 뜨기 전 그 자리 열쇠(같은 판 씨 · 같은 명부 자리 · 이어짐)', `${same}/${rows}`);
  ok(c.off === 0 && c.undef === 0 && c.dup === 0, '③ 다시 뜬 순간 — 겹침 0 · 어긋남 0', `몸 ${c.n}`);
  const newMax = Math.max(...T.vils.flatMap((vil) => vil.npcPids.map((pid) => +pid.slice(1))));
  ok(newMax < maxOldPid, '③ (판 조건) 다시 뜬 몸 번호가 1 부터 다시 셌다 — 옛 번호보다 작다', `새 최대 p${newMax} · 옛 최대 p${maxOldPid}`);
}

// ── ④ 다시 뜬 뒤 — 출생 · 죽음 · 겹침 0 · ★T822 열쇠였다면 겹쳤을 짝 ────────────────────────────
{
  const restoredOld = T.vils.map((vil, v) => new Map(before[v].slice(0, vil.npcPids.length).map((x, i) => [vil.npcPids[i], +x.pid.slice(1)])));   // 되살린 몸 → 옛 번호
  let worst = 0;
  for (let r = 0; r < 12; r++) {
    for (const vil of T.vils) {
      const e = vil.econ;
      if ((r + vil.dbId) % 3 === 0) econDeaths(e, 1);
      econBirths(e, 2);
      T.H.syncVillagePop(vil, 2);
      const c = census(T, SEED, PH); worst = Math.max(worst, c.dup + c.off + c.undef);
    }
  }
  //   T822 열쇠 셈 — 되살린 몸은 옛 번호 열쇠를 들고 · 그 밖의 몸(다시 뜬 뒤 선 몸 · 되살릴 줄이 없던 자리)은 새 번호 열쇠 ⇒ 같은 마을에서 번호가 같으면 같은 `_sh`
  let wouldPairs = 0;
  for (let v = 0; v < T.vils.length; v++) {
    const vil = T.vils[v], R = restoredOld[v];
    const alive = vil.npcPids.filter((pid) => T.players.has(pid));
    const oldNums = new Set(alive.filter((pid) => R.has(pid)).map((pid) => R.get(pid)));
    for (const pid of alive) if (!R.has(pid) && oldNums.has(+pid.slice(1))) wouldPairs++;
  }
  const c = census(T, SEED, PH);
  ok(worst === 0 && c.dup === 0, '④ 다시 뜬 뒤 출생 · 죽음 동기마다 겹침 0 · 어긋남 0', `몸 ${c.n}`);
  ok(wouldPairs > 0, '④ ★자명 통과 아님 — 같은 판을 T822 열쇠(`pid`)로 셌다면 겹쳤을 짝(같은 마을 · 되살린 몸의 옛 번호 = 새 몸 번호)', `${wouldPairs} 짝`);
}

// ── ⑤ 끔 — 이 문들은 `_sh` 를 안 굽는다(종전 글자 길) ───────────────────────────────────────
{
  const M0 = load({ T822_BODY_SEED: '0' });
  const T0 = world(M0);
  for (const vil of T0.vils) T0.H.syncVillagePop(vil, Infinity);
  econDeaths(T0.vils[0].econ, 1); T0.H.syncVillagePop(T0.vils[0], 2);
  const c = census(T0, SEED, PH);
  ok(T0.H.T822_BODY_SEED === false && c.n > 0 && c.undef === c.n, '⑤ 끔(`=0`) — 출생 · 동기 문이 `_sh` 를 안 굽는다(존 `_shOf` 가 첫 결정에서 굽는 종전 길)', `몸 ${c.n} · 빈 ${c.undef}`);
  load({ T822_BODY_SEED: null });
}

// ── ⑥ 린트 — 명부를 바꾸는 줄마다 다시 굽기 · init 차례 ───────────────────────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8').split('\n');
  const MUT = /npcPids\.(push|splice|shift|unshift|pop|sort|reverse)\(|npcPids\s*=[^=]/;
  const sites = [], bare = [];
  for (let i = 0; i < src.length; i++) {
    const L = src[i], code = L.replace(/\/\/.*$/, '');
    if (!MUT.test(code) || /^\s*\/\//.test(L) || /npcPids: \[\]/.test(code)) continue;
    sites.push(i + 1);
    if (!/_t822Rekey\(/.test(L) && !/_t822Rekey\(/.test(src[i + 1] || '')) bare.push(i + 1);
  }
  ok(sites.length >= 8 && bare.length === 0, '⑥ 명부를 바꾸는 줄마다 `_t822Rekey`(같은 줄 · 다음 줄)', `자리 ${sites.length} · 빠진 줄 ${bare.join(',') || '0'}`);
  const iR = src.findIndex((l) => /if \(T747_BODY\) \{ try \{ _t747Restore\(\);/.test(l)), iB = src.findIndex((l) => /_t833Boot\(\);/.test(l) && /T822_BODY_SEED/.test(l));
  const iS = src.findIndex((l) => /syncVillagePop\(vil, Infinity\);/.test(l));
  ok(iS > 0 && iR > iS && iB > iR, '⑥ init 차례 = 부팅 출생 동기 → T747 되살림 → `_t833Boot`(하네스 ③ 이 따른 그 차례)', `${iS + 1} → ${iR + 1} → ${iB + 1}`);
}

console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
