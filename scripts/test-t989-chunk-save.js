#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t989-chunk-save.js — 청크를 넘으면 그 틱에 저장하나 (T989) ======================
//
// ★왜 [T917 회부 2 → T989] 몸 연속 칸(자리 · 허기 · 갈증 · 신체 · 젖음)은 주기 저장(30초)만 쓴다 — SIGKILL 이면 마지막 저장 뒤 30초까지 되돌아간다
//   (보고 T989 ① — 달리기 자리 최대 147.7m). 손잡이 `T989_CHUNK_SAVE`(★[T1000] 켬 기본 · `=0` = 종전)가 사람이 청크를 넘은 그 차례의 틱에 저장한다.
//
// 재는 것(존을 아이 프로세스 안에서 띄운다 · central 저장 문을 받아 적는 귀로 · `test-ghost-tree` 문법):
//   ① 술어 — `!== '0'`(켬 기본) · env 를 읽는 자리 하나 · 청크 열쇠는 `chunkManager.chunkSize`(새 수 0) · 주기 저장 고리 한 자리
//   ② 한 사람이 청크 경계 서쪽 200px 에서 동쪽으로 400px 걷고 선다(다음 주기 저장은 25초 뒤로 밀어 둔다 — 관측 창 8초 안엔 안 온다)
//      켬 — 경계를 넘은 뒤 1초 안에 저장 하나 · 그 자리 = 새 청크 · 다음 주기 저장 시각이 그 순간부터 다시 센다(30초 뒤)
//      ★끔(`=0`) — 관측 창에 저장 0(종전 · 자명 통과 금지 — 켬 판과 같은 걸음)
//      둘 다 — 서 있는 동안(청크 그대로) 더 저장하지 않는다
//
// 실행: node scripts/test-t989-chunk-save.js   (아이 둘 · 약 1분)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (process.env.T989_SUB === '1') {
  (async () => {
    const TMP = `/tmp/test-t989-${process.pid}.db`;
    for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.on('exit', () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } });
    Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(39700 + (process.pid % 90)), DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
    const CC = require(path.join(ROOT, 'server', 'central-client.js'));
    const saves = [];
    CC.updatePlayer = async (id, patch) => { if (id === 'acc_t989t') saves.push({ t: Date.now(), x: patch.last_x, y: patch.last_y }); return { ok: true }; };
    const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
    const Zone = require(path.join(ROOT, 'server', 'zone.js'));
    const H = Zone.__testBind();
    const CS = H.chunkManager.chunkSize;
    // 동쪽으로 400px 막힘 없는 경계 자리를 세계에 묻는다
    let start = null;
    for (let cy = 60; cy < 120 && !start; cy++) for (let cx = 30; cx < 60; cx++) {
      const bx = cx * CS, y = cy * CS + CS / 2;
      let free = true; for (let k = -220; k <= 220; k += 16) if (H.isTerrainBlockedLocal(bx + k, y)) { free = false; break; }
      if (free) { start = { x: bx - 200, y, bx }; break; }
    }
    const me = { pid: 'p_t989t', playerId: 'acc_t989t', name: 't989t', persistent: true, ws: { readyState: 1, send: () => {} },
      x: start.x, y: start.y, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
      inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
    H.players.set(me.pid, me);
    await sleep(1500);   // 첫 배정(흩음)이 서고 청크가 켜진다
    const assigned = me._nextSaveAt > 0 && me._savedX === start.x;
    me._nextSaveAt = Date.now() + 25000;   // 관측 창(8초) 밖으로 — 주기 저장이 창 안에 우연히 오지 않게
    saves.length = 0;
    let seq = 0, crossedAt = null;
    const t0 = Date.now();
    while (Date.now() - t0 < 8000) {
      const go = me.x < start.x + 400;
      for (let i = 0; i < 3; i++) H.handlePlayerInput(me, JSON.stringify({ type: 'input', seq: ++seq, vx: go ? 1 : 0, vy: 0, sprint: false }));
      await sleep(100);
      if (crossedAt == null && me.x >= start.bx) crossedAt = Date.now();
    }
    const out = { on: process.env.T989_CHUNK_SAVE !== '0', CS, start, assigned, crossedAt, saves, endX: me.x, next: me._nextSaveAt - Date.now(),
      chunkStat: (H._saveStats() || {}).chunk || 0 };
    _l(JSON.stringify(out));
    process.exit(0);
  })();
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
console.log('\n=== 청크를 넘으면 그 틱에 저장하나 (T989) ===\n');
console.log('① 술어');
ok(/const T989_CHUNK_SAVE = process\.env\.T989_CHUNK_SAVE !== '0';/.test(SRC), '`T989_CHUNK_SAVE` 는 `!== \'0\'` — ★[T1000] 켬 기본 · 되돌림 `=0`');
ok((SRC.match(/process\.env\.T989_CHUNK_SAVE/g) || []).length === 1, 'env 를 읽는 자리 하나');
ok(/function _t989Chunk\(x, y\) \{ const cs = chunkManager\.chunkSize; return Math\.floor\(x \/ cs\) \+ ',' \+ Math\.floor\(y \/ cs\); \}/.test(SRC), '청크 열쇠 = 세계의 청크 한 변(`chunkManager.chunkSize` · 새 수 0)');
ok((SRC.match(/_t989Chunk\(/g) || []).length === 3 && /if \(!_t989 && now < p\._nextSaveAt\) continue;/.test(SRC), '읽는 자리 = 주기 저장 고리 한 자리(넘었으면 시각을 안 기다린다 · 다음 시각은 그 순간부터)');
const sub = (env) => { const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, T989_SUB: '1', ...env }, encoding: 'utf8', timeout: 300000 });
  const line = (r.stdout || '').split('\n').filter((l) => l.startsWith('{')).pop(); return line ? JSON.parse(line) : null; };
const on = sub({ T989_CHUNK_SAVE: '' }), off = sub({ T989_CHUNK_SAVE: '0' });   // ★[T1000] 켬 = env 없음(기본) · 끔 = `=0`
console.log('② 경계를 걸어 넘는다(켬 · 끔 — 같은 걸음)');
for (const [k, r] of [['켬', on], ['끔', off]]) console.log(`  · ${k}: 출발 ${r && r.start.x} → 끝 ${r && r.endX.toFixed(0)} · 경계 ${r && r.start.bx} · 넘은 뒤 저장 ${r ? r.saves.map((s) => `+${s.t - r.crossedAt}ms@${Math.round(s.x)}`).join(' ') || '0' : '?'} · 다음 주기 ${r && Math.round(r.next / 1000)}초 뒤`);
ok(on && off && on.assigned && off.assigned && on.crossedAt && off.crossedAt, '[상황] 첫 배정이 섰고 두 판 다 경계를 넘었다');
const onAfter = on ? on.saves.filter((s) => s.t >= on.crossedAt - 200) : [];
ok(onAfter.length === 1 && onAfter[0].t - on.crossedAt <= 1000 && Math.floor(onAfter[0].x / on.CS) === Math.floor(on.start.bx / on.CS), '★켬 — 넘은 뒤 1초 안에 저장 하나 · 그 자리 = 새 청크', onAfter.map((s) => `+${s.t - on.crossedAt}ms`).join(' '));
ok(on && on.next > 20000 && on.chunkStat === 1, '켬 — 다음 주기 저장은 그 순간부터 다시 센다(30초 뒤) · 계측 칸 1', on && `${Math.round(on.next / 1000)}초 · ${on.chunkStat}`);
ok(off && off.saves.length === 0, '★끔(`=0`) — 관측 창에 저장 0(종전 — 다음 주기 저장까지 넘은 자리는 어디에도 없다)', off && off.saves.length);
ok(on && on.saves.length === 1, '켬 — 선 뒤(청크 그대로)엔 더 저장하지 않는다', on && on.saves.length);
console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
