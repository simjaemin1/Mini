#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-wild-door.js — 야생 그림자를 맞히는 문 하나 · NPC 타격 랩 놀람 · 화살 사냥 장부(T1009 · 실서버 함수 · 자식 프로세스 · 몇 초) ======
//
// ★왜 [T998 회부 1 · 2 · ★PM 결함 "같은 몸 · 같은 규칙"] 사람 공격 · 화살은 맞힐 때마다 랩 동기 문(`Wildlife.onMobHit`)으로 랩에 놀람
//   (`fcd` 20 · `pause` 0)과 반격 돌진 굴림(늑대 · 멧돼지 · 호랑이 `brave × tmp × 0.45`)을 주는데 **안 죽는 NPC 타격은 안 줬다**(같은 존 틱
//   뒤쪽 야생 틱 ④ 폴링 보정이 hp · `fcd` 만 맞춘다 — `pause` 도 반격 굴림도 없다). 그리고 사람 공격으로 잡으면 마을 사냥 장부에서 한 마리
//   빼는데(`SimVillages.huntKillAt` · T146 §0-ⓒ) **화살로 잡으면 안 뺐다**. T1009(손잡이 `T1009_WILD_DOOR` · 켬 기본 · `=0` 되돌림) =
//   세 길(사람 공격 · 화살 · NPC 타격)이 문 하나(`wildHit`)를 지난다(사본 0).
// 판 = 손잡이 켬 · 끔 = 자식 둘. 자식마다 존을 임시 DB · 임시 포트로 한 프로세스에 띄우고(`ENABLE_WILDLIFE=1` · 마을 · 도적 · 길 끔) 존이 쥔
//   **그 야생 인스턴스**를 최소 host 로 다시 init 한다(`test-npc-wild-sync` 꼴 — 64×64 · 랩 장부 100 · 결정론 굴림 · 몹 표 = 존의 `mobs` ·
//   문 = 존의 `setMobHp` · 사람 표 = 존의 `players` — 그래서 NPC · 사람 몸에 랩 프록시가 선다 · 반격 표적이 된다).
//   마을 장부는 정본 함수가 읽는 자리에 꽂는다(`__labProbe._t569Probe.setup` — 최소 주입구 · 장부 셀 하나마다 마을 하나 · 50 마리).
//   반격 굴림은 맞히는 그 순간만 하네스 굴림을 0 으로 세운다(굴림이 섰으면 돌진 — 굴림이 서느냐가 규칙이다 · 벽시계 0 · 결정론).
// 보는 것:
//   ① [상황] 판마다 늑대 그림자가 섰다(isWild · DB 행 없음) · NPC · 사람 몸에 랩 프록시가 섰다 · 장부를 꽂았다
//   ② ★★켬 — 안 죽는 NPC 타격이 그 자리에서 랩을 놀래고(`fcd` 20 · `pause` 0 · hp 동기) 반격 굴림이 선다(NPC 프록시로 돌진)
//      — 사람 공격(같은 판 · 대조)과 같은 반응 · 끔 — 그 자리엔 아무것도 없다(굴림 0) · 다음 야생 틱에 hp · `fcd` 만(④) · `pause` · 돌진 0
//   ③ ★★켬 — 화살로 잡으면 장부 −1(사람 공격 길 그 줄 · 그 차례: 랩 → 장부 → 지움) · 끔 — 장부 그대로(종전)
//   ④ ★사람 공격으로 잡으면 두 판 다 장부 −1(종전부터 · 손잡이와 무관) · NPC 가 잡으면 두 판 다 장부 0(사냥꾼 장부는 하루치 — T158)
//   ⑤ ★안 죽는 화살 · 사람 공격은 두 판 다 그 자리 놀람(종전부터)
// 실행: node scripts/test-wild-door.js   (임시 DB · 임시 포트 · 라이브 무접촉)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const MODE = process.env.T1009_WD_MODE || '';

if (MODE) child(); else parent();

function child() {
  const OUT = process.env.T1009_WD_OUT;
  Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: process.env.T1009_WD_DB, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', LATENCY_MS: '0' });
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  const W = require(path.join(ROOT, 'server', 'wildlife.js'));   // 존이 쥔 그 인스턴스(require 캐시)
  const V = require(path.join(ROOT, 'server', 'villages.js'));   // 존이 쥔 그 마을 모듈(`SimVillages`)
  const res = { knob: H.T1009_WILD_DOOR, t998: H.T998_NPC_WILD_SYNC, wildOn: W.enabled };
  // 존의 야생 인스턴스를 최소 host 로 다시 init — 몹 표 · 문 · 사람 표는 존의 것
  const N = 64, CH = 512, CC = CH / 32;
  const LED = new Map(); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) LED.set(x + ',' + y, 100);
  const keys = new Set(); for (let cy = 0; cy < N / CC; cy++) for (let cx = 0; cx < N / CC; cx++) keys.add(cx + '_' + cy);
  let st = 1020 | 0, FORCE = null, DRAWS = 0;
  const base = () => { st = (st + 0x6D2B79F5) | 0; let x = Math.imul(st ^ (st >>> 15), 1 | st); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  const rng = () => { DRAWS++; return FORCE !== null ? FORCE : base(); };
  W.init({ rng, ZONE_ID: 'hanbando', TICK_HZ: 30, ZONE: { zoneWidth: 32 * N, zoneHeight: 32 * N },
    WORLD: { dayLengthMs: 1440000, dayPhaseRatio: 0.7, worldEpoch: 0 },
    isTerrainBlockedLocal: () => false, isRockTileLocal: () => false, terrainMod: { getForestMultiplier: () => 2 },
    chunkManager: { chunkSize: CH, removeMob: () => {}, insertMob: () => {}, updateMobChunk: () => {} },
    players: H.players, mobs: H.mobs, getActiveChunkKeys: () => keys, isPositionActive: () => true,
    spawnCorpse: () => {}, damagePlayer: () => {}, broadcast: () => {}, setMobHp: H.setMobHp, simVillages: () => [], legacyVillages: [], warThreats: () => [],
    gameRichAt: (k) => LED.get(String(k)), gameRichSize: () => LED.size });
  const S = W._debug.S;
  let t = 60000;
  const tick = () => { t += 1000 / 30; W.tick(t); };
  for (let i = 0; i < 600; i++) tick();
  // 사건 차례 — 랩 문 · 장부 · mob_removed(맞히는 그 순간만 감싼다)
  const ev = [];
  H.players.set('t1009_watch', { pid: 't1009_watch', playerId: 't1009_watch', name: '눈', x: -1e7, y: -1e7, floor: 0, isNpc: false, hp: 100, maxHp: 100,
    ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'mob_removed') ev.push('removed'); } catch (e) {} } } });
  const onHit0 = W.onMobHit, kill0 = V.huntKillAt;
  const watch = (fn, force) => {
    ev.length = 0;
    W.onMobHit = function (...a) { ev.push('lab'); return onHit0.apply(this, a); };
    V.huntKillAt = function (...a) { ev.push('ledger'); return kill0.apply(this, a); };
    const d0 = DRAWS; FORCE = force === undefined ? null : force;
    try { fn(); } finally { W.onMobHit = onHit0; V.huntKillAt = kill0; FORCE = null; }
    return { order: ev.slice(), draws: DRAWS - d0 };
  };
  const labWolf = (px, py, gid) => { const lm = { px, py, type: '🐺', gid, hp: 4, tmp: 1, stam: 1, hun: 0, ang: 0, pause: 0, cd: 0, fcd: 0, cvo: 0, cvt: 0, flk: 0, st: 'prowl' }; S.mobs.push(lm); return lm; };
  const shadowOf = (lm) => [...H.mobs.values()].find((m) => m._wildRef === lm) || null;
  const used = [];
  const quiet = () => {   // 둘레 160px 에 존 몹 0 인 칸(64×64 안 · 결정론 · 앞 판 자리 피함) — 근접 · 화살이 엉뚱한 몹을 안 고르게
    for (let cy = 4; cy < N - 4; cy++) for (let cx = 4; cx < N - 4; cx++) {
      const x = cx * 32 + 16, y = cy * 32 + 16;
      if (used.some((q) => Math.abs(q[0] - cx) < 10 && Math.abs(q[1] - cy) < 10)) continue;
      let near = false; for (const m of H.mobs.values()) if (Math.abs(m.x - x) < 160 && Math.abs(m.y - y) < 160) { near = true; break; }
      if (!near) { used.push([cx, cy]); return [cx + 0.5, cy + 0.5]; }
    }
    return null;
  };
  const labState = (lm) => ({ st: lm.st, hp: +lm.hp.toFixed(3), fcd: lm.fcd, pause: lm.pause, corpsed: lm._corpsed || 0, link: !!lm._shadow,
    tgt: lm.tgt ? (lm.tgt._real ? lm.tgt._real.pid : 'proxy?') : null });
  const npcOf = (pid, sh) => ({ pid, playerId: 'npc_' + pid, name: 'NPC', isNpc: true, x: sh.x + 10, y: sh.y, vx: 0, vy: 0, floor: 0,
    behavior: 'fight', fightTarget: sh.mid, lastAttackAt: 0, nextDecisionAt: Infinity, inventory: {}, hp: 100, maxHp: 100 });
  const playerOf = (pid, x, y) => ({ pid, playerId: 'pl_' + pid, name: '사람', ws: { readyState: 1, send: () => {} }, x, y, floor: 0, hp: 100, maxHp: 100, isNpc: false,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, equipped: null, hotkey1: null, tribeId: null, tribeName: null, hunger: 100, thirst: 100, oreCarry: {},
    lastAttackAt: 0, lastRangedAt: 0, vp: 0 });
  // 판 하나 = 조용한 칸에 랩 늑대 → 몸(NPC · 사람)을 존 사람 표에 → 한 틱(그림자 · 프록시가 선다) → 몸을 그림자 곁으로 → 맞힘
  const vils = [];
  V.__labProbe._t569Probe.setup({ villages: vils });   // 장부 자리(정본 `huntKillAt` 이 훑는 `state.villages`) — 판마다 그 셀 마을 하나
  const ledgerAt = (sh) => { const cx = Math.floor(sh.x / 32), cy = Math.floor(sh.y / 32), k = cx + ',' + cy;
    const v = { name: 'T1009_' + k, ccx: cx, ccy: cy, npcPids: [], _gameRich: new Map([[k, 50]]) }; vils.push(v); return () => v._gameRich.get(k); };
  const stage = (tag, labHp, shHp, body) => {
    const q = quiet() || [40.5, 40.5];
    const lm = labWolf(q[0], q[1], 991000 + vils.length);
    const who = body === 'npc' ? null : playerOf('t1009_' + tag, 0, 0);
    let npc = null;
    if (who) H.players.set(who.pid, who);
    tick();
    const sh = shadowOf(lm);
    if (!sh) return { tag, err: '그림자 없음' };
    if (body === 'npc') { npc = npcOf('t1009_' + tag, sh); H.players.set(npc.pid, npc); tick(); }   // 프록시는 야생 틱 ③ 이 세운다
    const sh2 = shadowOf(lm) || sh;
    lm.hp = labHp; sh2.hp = shHp; lm._lsh = shHp; lm.fcd = 0; lm.pause = 5; lm.tgt = null; lm.cd = 0;   // 맞기 전 칸(놀람 0 · 멈춤 5 — 문이 서면 지운다)
    const led = ledgerAt(sh2), led0 = led(), cor0 = H.corpses.size;
    const body0 = npc || who;
    if (body === 'npc') { npc.x = sh2.x + 10; npc.y = sh2.y; }
    else if (body === 'melee') { who.x = sh2.x - 20; who.y = sh2.y; }
    else { who.x = sh2.x - 150; who.y = sh2.y; }
    const r = watch(() => {
      if (body === 'npc') H.npcStep(npc, 1 / 30, 1e6 + vils.length * 2000);
      else if (body === 'melee') { who.lastAttackAt = 0; H.tryAttack(who); }
      else { who.lastRangedAt = 0; H.tryRangedAttack(who, sh2.x, sh2.y); for (let i = 0; i < 90 && H.mobs.has(sh2.mid); i++) { const h0 = sh2.hp; H.stepArrows(1 / 30); if (sh2.hp !== h0) break; } }
    }, 0);
    const out = { tag, body, order: r.order, draws: r.draws, zoneHp: sh2.hp, zoneGone: !H.mobs.has(sh2.mid), lab: labState(lm), proxyPid: body0.pid,
      ledger: [led0, led()], corpses: H.corpses.size - cor0, wild: !!sh2.isWild, dbId: sh2.dbId == null ? null : sh2.dbId };
    tick();
    out.labTick = labState(lm);
    H.players.delete(body0.pid);
    return out;
  };
  res.npcHit = stage('npcHit', 4, 40, 'npc');          // ② 안 죽는 NPC 타격(8 — 40 → 32)
  res.meleeHit = stage('meleeHit', 4, 40, 'melee');    // ② · ⑤ 대조 — 안 죽는 사람 공격(10 — 40 → 30)
  res.arrowHit = stage('arrowHit', 4, 40, 'arrow');    // ⑤ 안 죽는 화살(25 — 40 → 15)
  res.arrowKill = stage('arrowKill', 2.5, 25, 'arrow');  // ③ 화살로 잡음(25)
  res.meleeKill = stage('meleeKill', 1, 10, 'melee');  // ④ 사람 공격으로 잡음(10)
  res.npcKill = stage('npcKill', 0.8, 8, 'npc');       // ④ NPC 가 잡음(8 · T998 켬)
  fs.writeFileSync(OUT, JSON.stringify(res));
  process.kill(process.pid, 'SIGKILL');
}

function parent() {
  const { spawnSync } = require('child_process');
  let pass = 0, fail = 0;
  const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
  const seen = (m) => console.log(`  [관찰] ${m}`);
  const TMPD = fs.mkdtempSync('/tmp/t1009-wd-');
  let port = 35400 + (process.pid % 40) * 2;   // 판 둘 = 두 자리
  const R = {};
  for (const knob of ['on', 'off']) {
    const db = path.join(TMPD, `${knob}.db`), out = path.join(TMPD, `${knob}.json`);
    const env = Object.assign({}, process.env, { T1009_WD_MODE: 'run', T1009_WD_DB: db, T1009_WD_OUT: out, PORT: String(port++) });
    delete env.T1009_WILD_DOOR; delete env.T998_NPC_WILD_SYNC; delete env.T146_GAME; delete env.NODE_OPTIONS;
    if (knob === 'off') env.T1009_WILD_DOOR = '0';
    if (env.T1025_EV_CORPSE == null) env.T1025_EV_CORPSE = '0';   // ★[PM land1034] T1025 켬이면 장부는 잡은 순간이 아니라 사체가 끝날 때(도살 · 부패) — 이 하네스는 잡은 순간 판(T1009 글자)을 쥔다 · T1025 켬 판은 T1032 가 넓힌다
    const r = spawnSync(process.execPath, [__filename], { encoding: 'utf8', timeout: 120000, env });
    try { R[knob] = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { R[knob] = { err: `결과 없음(종료 ${r.status} · 신호 ${r.signal})` }; }
  }
  try { fs.rmSync(TMPD, { recursive: true, force: true }); } catch (e) {}
  console.log('\n=== 야생 그림자를 맞히는 문 하나 — NPC 타격 랩 놀람 · 화살 사냥 장부 — T1009(`T1009_WILD_DOOR` 켬 · 끔) ===');
  const allOk = ['on', 'off'].every((k) => !R[k].err);
  ok(allOk, '[상황] 판 둘 다 섰다(자식 결과)', ['on', 'off'].map((k) => `${k} ${R[k].err || 'ㅇ'}`).join(' · '));
  if (!allOk) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); process.exit(1); }
  const on = R.on, off = R.off;
  const ST = ['npcHit', 'meleeHit', 'arrowHit', 'arrowKill', 'meleeKill', 'npcKill'];
  const bad = ST.flatMap((k) => [on, off].filter((r) => !r[k] || r[k].err).map((r) => `${r === on ? '켬' : '끔'} ${k} ${(r[k] && r[k].err) || '없음'}`));
  console.log('\n① 상황');
  ok(on.knob === true && off.knob === false && on.t998 === true && off.t998 === true && on.wildOn && off.wildOn,
    '[상황] 손잡이가 판대로 섰다(T998 은 두 판 다 켬 기본) · 존의 야생 인스턴스가 켜졌다', `켬 ${on.knob} · 끔 ${off.knob} · T998 ${on.t998}/${off.t998}`);
  ok(!bad.length && ST.every((k) => [on, off].every((r) => r[k].wild && r[k].dbId === null)),
    '[상황] 판 여섯 × 둘 다 늑대 그림자가 섰다(isWild · DB 행 없음)', bad.join(' · ') || '12/12');
  if (bad.length) { console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`); process.exit(1); }
  ok([on, off].every((r) => r.npcHit.ledger[0] === 50 && r.arrowKill.ledger[0] === 50) && [on, off].every((r) => r.npcHit.zoneHp === 32 && r.meleeHit.zoneHp === 30 && r.arrowHit.zoneHp === 15),
    '[상황] 장부를 꽂았다(셀마다 50) · 맞힘이 존 hp 를 깎았다(NPC 8 · 사람 10 · 화살 25 — 안 죽음)', `NPC ${on.npcHit.zoneHp} · 사람 ${on.meleeHit.zoneHp} · 화살 ${on.arrowHit.zoneHp}`);
  for (const k of ST) seen(`${k}: 켬 차례 ${on[k].order.join(' → ') || '(없음)'} · 굴림 ${on[k].draws} · 랩 ${JSON.stringify(on[k].lab)} · 장부 ${on[k].ledger.join('→')} · 존 사체 ${on[k].corpses} | 끔 차례 ${off[k].order.join(' → ') || '(없음)'} · 굴림 ${off[k].draws} · 랩 ${JSON.stringify(off[k].lab)} · 장부 ${off[k].ledger.join('→')} · 존 사체 ${off[k].corpses}`);

  console.log('\n② 안 죽는 NPC 타격 — 랩 놀람 · 반격 굴림');
  const startled = (r, hp) => r.lab.fcd === 20 && r.lab.pause === 0 && Math.abs(r.lab.hp - hp) < 1e-9;
  ok(on.npcHit.order.join() === 'lab' && startled(on.npcHit, 3.2) && on.npcHit.draws === 1 && on.npcHit.lab.tgt === on.npcHit.proxyPid,
    '★★② 켬 — 안 죽는 NPC 타격이 그 자리에서 랩 문을 지난다: 놀람(`fcd` 20 · `pause` 0) · hp 동기(3.2) · 반격 굴림 한 번 → NPC 프록시로 돌진', `${JSON.stringify(on.npcHit.lab)} · 굴림 ${on.npcHit.draws}`);
  ok(on.meleeHit.order.join() === 'lab' && startled(on.meleeHit, 3) && on.meleeHit.draws === 1 && on.meleeHit.lab.tgt === on.meleeHit.proxyPid,
    '★② 켬 — 사람 공격(대조 · 같은 판)이 같은 반응이다(놀람 · hp 동기 3 · 반격 굴림 한 번 → 사람 프록시) — NPC 길이 같은 규칙', `${JSON.stringify(on.meleeHit.lab)} · 굴림 ${on.meleeHit.draws}`);
  ok(off.npcHit.order.length === 0 && off.npcHit.draws === 0 && off.npcHit.lab.fcd === 0 && off.npcHit.lab.pause === 5 && off.npcHit.lab.hp === 4 && off.npcHit.lab.tgt === null,
    '★★② 끔 — 안 죽는 NPC 타격은 그 자리에서 랩에 아무것도 안 한다(문 0 · 굴림 0 · hp 4 그대로 · 놀람 0) — 위가 자명 통과가 아니다', JSON.stringify(off.npcHit.lab));
  ok(Math.abs(off.npcHit.labTick.hp - 3.2) < 1e-9 && off.npcHit.labTick.tgt !== off.npcHit.proxyPid,
    '★② 끔 — 다음 야생 틱 ④ 폴링 보정이 hp(3.2)만 맞춘다 — 반격 돌진은 끝내 없다(종전 갈림)', JSON.stringify(off.npcHit.labTick));

  console.log('\n③ 화살로 잡음 — 마을 장부');
  ok(on.arrowKill.zoneGone && on.arrowKill.lab.st === 'dead' && on.arrowKill.ledger[1] === 49 && on.arrowKill.order.join() === 'lab,ledger,removed',
    '★★③ 켬 — 화살로 잡으면 장부 −1(50 → 49) · 차례 = 랩 → 장부 → 지움(사람 공격 길 그 차례)', `${on.arrowKill.ledger.join(' → ')} · ${on.arrowKill.order.join(' → ')}`);
  ok(off.arrowKill.zoneGone && off.arrowKill.lab.st === 'dead' && off.arrowKill.ledger[1] === 50 && off.arrowKill.order.join() === 'lab,removed',
    '★★③ 끔 — 화살로 잡아도 장부 그대로(50 · 종전) — 위가 자명 통과가 아니다', `${off.arrowKill.ledger.join(' → ')} · ${off.arrowKill.order.join(' → ')}`);

  console.log('\n④ 사람 공격 · NPC 로 잡음 — 손잡이와 무관(대조)');
  ok([on, off].every((r) => r.meleeKill.zoneGone && r.meleeKill.ledger[1] === 49 && r.meleeKill.order.join() === 'lab,ledger,removed'),
    '★④ 사람 공격으로 잡으면 두 판 다 장부 −1 · 랩 → 장부 → 지움(종전 두 줄이 문으로 옮겨도 글자 · 차례 그대로)', `${on.meleeKill.order.join(' → ')} | ${off.meleeKill.order.join(' → ')}`);
  ok([on, off].every((r) => r.npcKill.zoneGone && r.npcKill.ledger[1] === 50 && r.npcKill.order.join() === 'lab,removed' && r.npcKill.lab.st === 'dead'),
    '★④ NPC 가 잡으면 두 판 다 장부 0 · 랩 → 지움(T998 켬 · 사냥꾼 장부 몫은 하루치 `huntTakeAt` — T158)', `${on.npcKill.order.join(' → ')} | ${off.npcKill.order.join(' → ')}`);

  seen(`존 사체(잡은 판 · 켬 | 끔): 사람 공격 ${on.meleeKill.corpses} | ${off.meleeKill.corpses} · 화살 ${on.arrowKill.corpses} | ${off.arrowKill.corpses} · NPC ${on.npcKill.corpses} | ${off.npcKill.corpses} — NPC 죽음 길은 사체를 안 낸다(종전 · 랩엔 사체 corpsed ${on.npcKill.lab.corpsed} — 회부)`);
  console.log('\n⑤ 안 죽는 화살 · 사람 공격 — 두 판 다 그 자리 놀람(종전부터)');
  ok([on, off].every((r) => r.arrowHit.order.join() === 'lab' && startled(r.arrowHit, 1.5) && r.meleeHit.order.join() === 'lab' && startled(r.meleeHit, 3)),
    '★⑤ 안 죽는 화살(hp 1.5) · 사람 공격(hp 3)은 두 판 다 랩 문 · 놀람 · hp 동기', `화살 ${JSON.stringify(off.arrowHit.lab)} · 사람 ${JSON.stringify(off.meleeHit.lab)}`);
  console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
}
