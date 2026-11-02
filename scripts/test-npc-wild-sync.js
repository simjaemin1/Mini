#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-npc-wild-sync.js — NPC 가 죽인 야생 그림자 · 랩 몸도 그 자리에서 죽나(T998 · 실서버 함수 · 자식 프로세스 · 몇 초) ======
//
// ★왜 [T987 회부 3] NPC 죽음 길(`npcStep`)은 랩 동기 문(`Wildlife.onMobHit`)을 안 불렀다(사람 공격 · 화살 길은 부른다). 재 보니 랩 늑대는
//   **같은 틱 뒤쪽의 야생 틱**(`Wildlife.tick` ④ 외부 피해 폴링 보정)에서 죽는다 — 갈림은 npcStep(틱 앞쪽)과 야생 틱(뒤쪽) 사이뿐이다.
//   T998(손잡이 `T998_NPC_WILD_SYNC` · 켬 기본 · `=0` 되돌림) = NPC 가 죽인 야생 그림자도 그 자리에서 그 문을 지난다(죽음만 · 사본 0).
// 판 = 손잡이 켬 · 끔 = 자식 둘. 자식마다 존을 임시 DB · 임시 포트로 한 프로세스에 띄우고(`ENABLE_WILDLIFE=1` — 존의 야생 인스턴스가 켜진다 ·
//   마을 · 도적 · 길 끔) 그 **같은 야생 인스턴스**를 최소 host 로 다시 init 한다(`test-zone-fauna` ④ 꼴 — 64×64 · 장부 100 · 결정론 굴림 ·
//   몹 표는 존의 `mobs` · 문은 존의 `setMobHp`). 데우기 600틱 뒤 랩 늑대(블록 `spawnGrp` 꼴 픽스처)를 세워 한 틱 → 존 그림자.
//   그 그림자를 NPC(`npcStep` — 진짜 함수)가 한 대에 죽인다(랩 hp 0.8 · 그림자 8 · NPC 8). 사건 차례는 랩 문 · DB 삭제 · `mob_removed` ·
//   다시 낳기 타이머를 감싸 센다(벽시계 0 · 결정론).
// 보는 것:
//   ① [상황] 판마다 랩 늑대 그림자가 섰다(type wolf · isWild · 랩 짝) · NPC 한 대에 존에서 빠졌다
//   ② ★★켬 — npcStep 안에서 랩 늑대가 죽는다(st dead · hp 0 · 사체 표 — 존 길이 사체를 맡는다) · 차례 = 랩 → 지움(DB 행 없음 · 다시 낳기 없음)
//   ③ ★끔 — npcStep 직후 랩 늑대는 산다(hp 0.8) · 다음 야생 틱 한 번에 죽는다(폴링 보정) — 위가 자명 통과가 아니고 · 갈림이 한 틱 안이라는 것
//   ④ ★사람 공격 길(같은 판 · 같은 그림자 꼴)의 차례와 같다 — 랩 → 지움
//   ⑤ ★DB 늑대(그림자 아님)를 NPC 가 죽이면 랩 문은 안 불린다 · DB 삭제 → 지움 → 다시 낳기(T975 · T987 차례 그대로 · 두 판 같음)
// 실행: node scripts/test-npc-wild-sync.js   (임시 DB · 임시 포트 · 라이브 무접촉)
'use strict';
// ★[T1065 판 꾸밈] 이 하네스가 재는 것 = NPC · 사람 공격의 야생 그림자 동기(맨손 픽스처) — 도구 문(`T1065_TOOL_GATE` · 맨손 거부 · 활 없음)은 `test-t1065-tool-gate` 가 잰다. 단언 무변 · 손으로 켜 볼 수 있다(env 를 주면 그 값).
process.env.T1065_TOOL_GATE = process.env.T1065_TOOL_GATE || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T998_WS_MODE || '';

if (MODE) child(); else parent();

function child() {
  const OUT = process.env.T998_WS_OUT;
  Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: process.env.T998_WS_DB, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const W = require(path.join(ROOT, 'server', 'wildlife.js'));   // 존이 쥔 그 인스턴스(require 캐시)
  const res = { knob: H.T998_NPC_WILD_SYNC, wildOn: W.enabled };
  // 존의 야생 인스턴스를 최소 host 로 다시 init — 몹 표 · 문은 존의 것(그림자가 존 `mobs` 에 선다)
  const N = 64, CH = 512, CC = CH / 32;
  const LED = new Map(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) LED.set(x + ',' + y, 100);
  const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
  let st = 1020 | 0; const rng = () => { st = (st + 0x6D2B79F5) | 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  W.init({ rng, ZONE_ID: 'hanbando', TICK_HZ: 30, ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N },
    WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
    isTerrainBlockedLocal: () => false, isRockTileLocal: () => false, terrainMod: { getForestMultiplier: () => 2 },
    chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
    players: new Map(), mobs: H.mobs, getActiveChunkKeys: () => keys, isPositionActive: () => true,
    spawnCorpse: () => {}, damagePlayer: () => {}, broadcast: () => {}, setMobHp: H.setMobHp, simVillages: () => [], legacyVillages: [], warThreats: () => [],
    gameRichAt: (k) => LED.get(String(k)), gameRichSize: () => LED.size });
  const S = W._debug.S;
  let t = 60000;
  const tick = () => { t += 1000 / 30; W.tick(t); };
  for (let i = 0; i < 600; i++) tick();
  // 사건 차례 — 랩 문 · DB 삭제 · mob_removed · 다시 낳기 타이머(죽이는 그 순간만 감싼다)
  const ev = [];
  H.players.set('t998_watch', { pid: 't998_watch', playerId: 't998_watch', name: '눈', x: -1e7, y: -1e7, floor: 0, isNpc: false,
    ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'mob_removed') ev.push('removed'); } catch (e) {} } } });
  const onHit0 = W.onMobHit, del0 = H.db.deleteMob;
  const watch = (fn) => {
    ev.length = 0;
    const st0 = global.setTimeout;
    W.onMobHit = function (...a) { ev.push('lab'); return onHit0.apply(this, a); };
    H.db.deleteMob = function (...a) { ev.push('dbDelete'); return del0.apply(this, a); };
    global.setTimeout = function (f, ms, ...a) { const h = st0(f, ms, ...a); if (typeof f === 'function' && /spawnMob\(/.test(String(f))) { ev.push('respawn'); clearTimeout(h); } return h; };
    try { fn(); } finally { W.onMobHit = onHit0; H.db.deleteMob = del0; global.setTimeout = st0; }
    return ev.slice();
  };
  const labWolf = (px, py, gid) => { const lm = { px, py, type: '🐺', gid, hp: 4, tmp: 1, stam: 1, hun: 0, ang: 0, pause: 0, cd: 0, fcd: 0, cvo: 0, cvt: 0, flk: 0, st: 'prowl' }; S.mobs.push(lm); tick(); return lm; };
  const shadowOf = (lm) => [...H.mobs.values()].find((m) => m._wildRef === lm) || null;
  const quiet = (avoid) => {   // 둘레 160px 에 존 몹 0 인 칸(64×64 안 · 결정론) — 근접이 엉뚱한 몹을 안 고르게
    for (let cy = 4; cy < N - 4; cy++) for (let cx = 4; cx < N - 4; cx++) {
      const x = cx * 32 + 16, y = cy * 32 + 16;
      if (avoid.some((q) => Math.abs(q[0] - cx) < 10 && Math.abs(q[1] - cy) < 10)) continue;
      let near = false; for (const m of H.mobs.values()) if (Math.abs(m.x - x) < 160 && Math.abs(m.y - y) < 160) { near = true; break; }
      if (!near) return [cx + 0.5, cy + 0.5];
    }
    return null;
  };
  const labState = (lm) => ({ st: lm.st, hp: lm.hp, corpsed: lm._corpsed || 0, link: !!lm._shadow });
  // ── A: NPC 가 늑대 그림자를 죽인다
  const qA = quiet([]) || [40.5, 40.5];
  const lmA = labWolf(qA[0], qA[1], 99981), shA = shadowOf(lmA);
  res.A = { shadow: shA ? { type: shA.type, wild: !!shA.isWild, hp: shA.hp, dbId: shA.dbId } : null };
  if (shA) {
    lmA.hp = 0.8; shA.hp = 8; lmA._lsh = 8;   // 한 대(NPC 8)에 죽게
    const npc = { pid: 't998_npcA', playerId: 'npc_t998A', name: '사냥 NPC', isNpc: true, x: shA.x + 10, y: shA.y, vx: 0, vy: 0, floor: 0,
      behavior: 'fight', fightTarget: shA.mid, lastAttackAt: 0, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100 };
    res.A.order = watch(() => H.npcStep(npc, 1 / 30, 1e6));
    res.A.zoneGone = !H.mobs.has(shA.mid);
    res.A.labAfterNpc = labState(lmA);
    tick();
    res.A.labAfterTick = labState(lmA);
    res.A.reshadow = !!shadowOf(lmA);
  }
  // ── B: 사람 공격이 늑대 그림자를 죽인다(같은 꼴 · 대조)
  const qB = quiet([qA]) || [20.5, 20.5];
  const lmB = labWolf(qB[0], qB[1], 99982), shB = shadowOf(lmB);
  if (shB) {
    lmB.hp = 0.8; shB.hp = 8; lmB._lsh = 8;
    const p = { pid: 't998pB', playerId: 't998_B', name: '사냥꾼', ws: { readyState: 1, send: () => {} }, x: shB.x - 20, y: shB.y, floor: 0, inventory: {}, toolItems: [], equipment: [],
      equipSlots: {}, equipped: null, hotkey1: null, tribeId: null, tribeName: null, hunger: 100, thirst: 100, oreCarry: {}, lastAttackAt: 0, lastRangedAt: 0, vp: 0 };
    res.B = { order: watch(() => H.tryAttack(p)), zoneGone: !H.mobs.has(shB.mid), labAfter: labState(lmB) };
  }
  // ── C: NPC 가 DB 늑대(그림자 아님)를 죽인다 — 랩 문 없음 · T975 DB 삭제 → 지움 → T987 다시 낳기
  const C = H.spawnMob('wolf', { x: 900, y: 300, hp: 8 });
  const npcC = { pid: 't998_npcC', playerId: 'npc_t998C', name: '사냥 NPC', isNpc: true, x: C.x + 10, y: C.y, vx: 0, vy: 0, floor: 0,
    behavior: 'fight', fightTarget: C.mid, lastAttackAt: 0, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100 };
  res.C = { order: watch(() => H.npcStep(npcC, 1 / 30, 2e6)), zoneGone: !H.mobs.has(C.mid) };
  fs.writeFileSync(OUT, JSON.stringify(res));
  process.kill(process.pid, 'SIGKILL');
}

function parent() {
  const { spawnSync } = require('child_process');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const seen = (m) => console.log(`  [관찰] ${m}`);
  const TMPD = fs.mkdtempSync('/tmp/t998-ws-');
  let port = 38400 + (process.pid % 20) * 2;   // 판 둘 = 두 자리(다른 하네스가 안 쓰는 띠)
  const R = {};
  for (const knob of ['on', 'off']) {
    const db = path.join(TMPD, `${knob}.db`), out = path.join(TMPD, `${knob}.json`);
    const env = Object.assign({}, process.env, { T998_WS_MODE: 'run', T998_WS_DB: db, T998_WS_OUT: out, PORT: String(port++) });
    delete env.T998_NPC_WILD_SYNC; delete env.NODE_OPTIONS;
    if (knob === 'off') env.T998_NPC_WILD_SYNC = '0';
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000, env });
    try { R[knob] = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { R[knob] = { err: `결과 없음(종료 ${r.status} · 신호 ${r.signal})` }; }
  }
  try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== NPC 가 죽인 야생 그림자 — 랩 몸도 그 자리에서 — T998(`T998_NPC_WILD_SYNC` 켬 · 끔) ===');
  const allOk = ['on', 'off'].every((k) => !R[k].err);
  ok(allOk, '[상황] 판 둘 다 섰다(자식 결과)', ['on', 'off'].map((k) => `${k} ${R[k].err || 'ㅇ'}`).join(' · '));
  if (!allOk) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); process.exit(1); }
  const on = R.on, off = R.off;
  console.log('\n① 상황');
  ok(on.knob === true && off.knob === false && on.wildOn && off.wildOn, '[상황] 손잡이가 판대로 섰다 · 존의 야생 인스턴스가 켜졌다', `켬 ${on.knob} · 끔 ${off.knob}`);
  ok([on, off].every((r) => r.A.shadow && r.A.shadow.type === 'wolf' && r.A.shadow.wild && r.A.shadow.dbId == null && r.A.zoneGone),
    '[상황] 랩 늑대 그림자가 섰고(wolf · isWild · DB 행 없음) NPC 한 대에 존에서 빠졌다', on.A.shadow ? `그림자 hp ${on.A.shadow.hp}` : '');
  seen(`켬: 차례 ${on.A.order.join(' → ')} · npcStep 직후 랩 ${JSON.stringify(on.A.labAfterNpc)} · 야생 틱 뒤 ${JSON.stringify(on.A.labAfterTick)}`);
  seen(`끔: 차례 ${off.A.order.join(' → ')} · npcStep 직후 랩 ${JSON.stringify(off.A.labAfterNpc)} · 야생 틱 뒤 ${JSON.stringify(off.A.labAfterTick)}`);

  console.log('\n② 켬 — npcStep 안에서 랩 늑대가 죽는다');
  ok(on.A.labAfterNpc.st === 'dead' && on.A.labAfterNpc.hp === 0 && on.A.labAfterNpc.corpsed === 1 && on.A.labAfterNpc.link === false,
    '★★② 켬 — NPC 가 그림자를 죽인 그 자리에서 랩 늑대도 죽는다(st dead · hp 0 · 사체 표 — 존 길이 사체를 맡는다 · 그림자 고리 풀림)', JSON.stringify(on.A.labAfterNpc));
  ok(on.A.order.join() === 'lab,removed', '★② 켬 — 차례 = 랩 문 → `mob_removed`(그림자는 DB 행이 없어 삭제 0 · 야생이라 다시 낳기 0)', on.A.order.join(' → '));

  console.log('\n③ 끔 — 종전(폴링 보정) · 갈림은 한 틱 안');
  ok(off.A.labAfterNpc.st !== 'dead' && off.A.labAfterNpc.hp > 0 && off.A.order.join() === 'removed',
    '★③ 끔 — npcStep 직후 랩 늑대는 산다(랩 문이 안 불렸다 · 존에선 이미 빠졌다) — 위가 자명 통과가 아니다', `${JSON.stringify(off.A.labAfterNpc)} · 차례 ${off.A.order.join(' → ')}`);
  ok(off.A.labAfterTick.st === 'dead' && off.A.labAfterTick.hp === 0 && !off.A.reshadow,
    '★③ 끔 — 다음 야생 틱 한 번에 죽는다(④ 외부 피해 폴링 보정) — 갈림은 npcStep 과 야생 틱 사이뿐(같은 존 틱 안: NPC 걸음 → 야생 틱 차례)', JSON.stringify(off.A.labAfterTick));
  ok(on.A.labAfterTick.st === 'dead' && !on.A.reshadow, '③ 켬 — 야생 틱 뒤에도 그대로 죽음 · 그림자가 다시 안 선다', JSON.stringify(on.A.labAfterTick));

  console.log('\n④ 사람 공격 길(대조) — 같은 문 · 같은 차례');
  seen(`사람 공격: 켬 ${on.B.order.join(' → ')} · 끔 ${off.B.order.join(' → ')} · 랩 ${JSON.stringify(on.B.labAfter)}`);
  ok([on, off].every((r) => r.B.order.join() === 'lab,removed' && r.B.labAfter.st === 'dead' && r.B.zoneGone),
    '★④ 사람 공격이 늑대 그림자를 죽이면 두 판 다 랩 → 지움(종전부터) — 켬 판 NPC 길(②)이 이 차례와 같다', on.B.order.join(' → '));

  console.log('\n⑤ DB 늑대(그림자 아님) — 랩 문 없음 · T975 · T987 차례');
  seen(`NPC 가 DB 늑대: 켬 ${on.C.order.join(' → ')} · 끔 ${off.C.order.join(' → ')}`);
  ok([on, off].every((r) => r.C.zoneGone && r.C.order.join() === 'dbDelete,removed,respawn'),
    '★⑤ NPC 가 DB 늑대를 죽이면 두 판 다 DB 삭제 → `mob_removed` → 다시 낳기(15초 · HOSTILES_ON) · 랩 문 0', on.C.order.join(' → '));
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
