#!/usr/bin/env node
'use strict';
// === scripts/t1237-same-tick-kill.js — [T1237 회부] 한 틱 안 두 사람의 같은 짐승 잡기 → 주검 둘(관찰 · 판정 0 · 고치지 않는다) ==============
//
// 찾은 자리: `scripts/t1237-wd-run.js` 사냥 판(처음 판은 한 틱 안에 쿨다운을 풀어 거듭 쳤다) — 고라니 하나를 잡은 자리에서 주검이 열하나 섰다.
// 까닭(글자): 존 `tryAttack` 은 가까운 몹을 공간 색인 `qtMobs.queryCircle` 로 고른다. 색인은 틱 머리(`rebuildSpatialIndex`)에서만 다시 짓는데
//   잡힌 몹은 `mobs.delete` 로만 빠진다 → **다음 틱 머리까지 죽은 몹이 색인에 남는다.** 고르는 고리는 hp · `mobs.has` 를 안 본다 →
//   그 사이 둘째 공격이 같은 몹을 또 고르고(hp 는 더 내려가고) `hp <= 0` 이라 `killCorpse` 를 또 부른다 = 주검 둘 · 드롭 두 몫 · 알림 둘
//   (야생 그림자면 T1025 장부 몫도 주검마다 — 장부 −1 이 둘).
// 사람 하나는 쿨다운(500 ms)이 막는다 — **두 사람**(또는 사람 + 화살 · NPC 길)이 한 틱(33 ms) 안에 같은 짐승을 치면 선다. 종과 무관(DB 몹 · 야생 그림자).
// 판: 존을 임시 DB · 임시 포트 · 마을 · 야생 끔으로 띄우고(test-mob-respawn 꼴) 사슴 DB 몹(hp 5)을 조용한 자리에 세운다.
//   ⓐ 한 틱 안 — 두 사람이 차례로 한 번씩(같은 매크로태스크 · 둘 다 첫 공격이라 쿨다운 0) ⓑ 대조 — 둘 사이에 100 ms(틱 셋)를 둔다.
// 실행: node scripts/t1237-same-tick-kill.js   → JSON 한 줄(ⓐ 주검 수 · ⓑ 주검 수 · 알림)
const path = require('path');
const ROOT = path.join(__dirname, '..');
Object.assign(process.env, { ZONE_ID: 'hanbando', DB_PATH: `/tmp/t1237-same-tick-${process.pid}.db`, ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0',
  ENABLE_WILDLIFE: '0', LATENCY_MS: '0', PORT: String(require('./lib-port').port(39500)), T1065_TOOL_GATE: '0' });
const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
const Zone = require(path.join(ROOT, 'server', 'zone.js'));
const H = Zone.__testBind();
const notes = [];
const mk = (id, x, y) => ({ pid: 'p' + id, playerId: 'pl_' + id, name: '사냥꾼' + id, persistent: false,
  ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(id + ':' + o.text); } catch (e) {} } },
  x, y, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: {}, toolItems: [], equipment: [], equipSlots: {}, equipped: null, hotkey1: null,
  tribeId: null, tribeName: null, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {}, isNpc: false, isDown: false, vx: 0, vy: 0, lastAttackAt: 0, lastRangedAt: 0, vp: 0 });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (X, Y) => [...H.corpses.values()].filter((c) => c.mobType === 'deer' && Math.hypot(c.x - X, c.y - Y) < 100);
setTimeout(async () => {
  let X = 0, Y = 0;   // 조용한 자리(둘레 400 px 에 몹 0 · test-mob-respawn 꼴)
  for (let y = 4000; y < 120000 && !X; y += 1600) for (let x = 4000; x < 64000 && !X; x += 1600) {
    let busy = false; for (const m of H.mobs.values()) if (Math.abs(m.x - x) < 400 && Math.abs(m.y - y) < 400) { busy = true; break; }
    if (!busy) { X = x; Y = y; }
  }
  const a = mk(1, X - 20, Y), b = mk(2, X + 20, Y);
  // ⓐ 한 틱 안
  const m1 = H.spawnMob('deer', { x: X, y: Y, hp: 5 });
  H.players.set(a.pid, a); H.players.set(b.pid, b);
  await wait(100);   // 틱 셋 — 몹 · 사람이 색인에 든다
  const n0 = notes.length;
  await H.tryAttack(a); await H.tryAttack(b);
  const A = { corpses: near(X, Y).length, killers: near(X, Y).map((c) => c.killerPid), alive: H.mobs.has(m1.mid), notes: notes.slice(n0) };
  // ⓑ 대조 — 둘 사이에 틱 셋
  const Y2 = Y + 800, m2 = H.spawnMob('deer', { x: X, y: Y2, hp: 5 });
  a.x = X - 20; a.y = Y2; b.x = X + 20; b.y = Y2; a.lastAttackAt = 0; b.lastAttackAt = 0;
  await wait(100);
  const n1 = notes.length;
  await H.tryAttack(a); await wait(100); await H.tryAttack(b);
  const B = { corpses: near(X, Y2).length, killers: near(X, Y2).map((c) => c.killerPid), alive: H.mobs.has(m2.mid), notes: notes.slice(n1) };
  console.log = _log;
  console.log(JSON.stringify({ spot: [X, Y], sameTick: A, apart: B }));
  process.kill(process.pid, 'SIGKILL');
}, 3000);
