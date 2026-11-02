#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-seed-hp.js — 덜 벤 시드 자연물의 hp 가 재기동 · 청크 껐다 켬 뒤에도 남나 (T978) ==================
//
// ★왜 [T917 회부 3 → T978] `updateResourceHp` 는 DB 행이 있는 개체(`dbId`)만 쓴다 — 시드 개체(`s_*` · 청크가 씨로 낳는 나무 · 바위 · 광맥 …)를
//   몇 번 친 몫은 메모리에만 있어, 재기동(그리고 청크가 꺼졌다 켜질 때)마다 온전해진다. 손잡이 `T978_SEED_HP`(켬 기본 · `=0` = 종전)가
//   벤 장부 · 부분 수확 장부와 같은 문법의 셋째 장부(`seed_hp` · 시드 키 → [종, 남은 hp])로 고친다.
//
// 재는 것(존을 아이 프로세스 **안에서** 띄운다 — `test-ghost-tree` 문법 · `Zone.__testBind` · 플레이어 채집 `tryGather` 그 문):
//   ① 친다 — 한 판(`hit`): 시드 개체를 종마다(나무 · 바위 · 광맥 · 덤불 · 운철 — 그 자리에 있는 것) 한 번 친다(hp 가 줄고 0 이 안 된 것만 센다)
//      ⓐ 청크를 껐다 켠다(플레이어를 멀리 보냈다 데려온다 — 제품의 `activateChunk` 그 자리) → 남은 hp 인가
//      그 뒤 아이가 제 몸에 SIGTERM 또는 SIGKILL 을 보낸다(정리 0 — 죽는 그 순간까지 쓴 것만 남는다)
//   ② 다시 띄운다 — 다른 판(`check`): 같은 DB · 같은 자리 → 그 개체들의 hp
//   ③ 팔 넷: 켬 · 끔(`=0`) × SIGTERM · SIGKILL — ★켬은 남고(친 hp 그대로) · ★끔은 잃는다(온전 — 결함이 보인다 · 자명 통과 금지)
//   ④ DB 크기(파일 + WAL) · 장부 줄 수 · 다시 띄운 부팅 시간(require ~ 첫 활성화) · 끔 판은 `seed_hp` 표가 안 생긴다
//
// 실행: node scripts/test-seed-hp.js   (아이 넷 × 두 판 · 몇 분)
'use strict';
// ★[T1065 판 꾸밈] 이 하네스가 재는 것 = 시드 나무 hp 가 판을 건너나(맨손 피해 1 픽스처) — 도구 문(`T1065_TOOL_GATE` · 맨손 거부 · 활 없음)은 `test-t1065-tool-gate` 가 잰다. 단언 무변 · 손으로 켜 볼 수 있다(env 를 주면 그 값).
process.env.T1065_TOOL_GATE = process.env.T1065_TOOL_GATE || '0';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = ['tree', 'rock', 'ore', 'berry_bush', 'meteorite'];

if (process.env.T978_SUB) {
  (async () => {
    const MODE = process.env.T978_SUB, DBP = process.env.T978_DBP, KILL = process.env.T978_KILL || 'SIGKILL';
    process.env.ZONE_ID = 'hanbando'; process.env.PORT = String(39400 + (process.pid % 500)); process.env.DB_PATH = DBP;
    process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
    process.env.E2E_GIVE = '1';
    const _l = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
    const t0 = Date.now();
    const Zone = require(path.join(ROOT, 'server', 'zone.js'));
    const H = Zone.__testBind();
    const tReq = Date.now() - t0;
    const me = { pid: 'p_t978', playerId: 'tr_t978', name: 't978', persistent: false,
      ws: { readyState: 1, send: () => {} }, x: 0, y: 0, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100,
      inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
    H.players.set(me.pid, me);
    const BASE = { x: +(process.env.T978_X || 30000), y: +(process.env.T978_Y || 60000) };
    const goBase = async () => { me.x = BASE.x; me.y = BASE.y; await sleep(2500); };
    const goFar = async () => { me.x = BASE.x + 40000; me.y = BASE.y; await sleep(4000); };
    await goBase();
    const tUp = Date.now() - t0;
    const out = { mode: MODE, on: H._t978On(), tReq, tUp, hits: [], after: {} };
    if (MODE === 'hit') {
      const near = [...H.resources.values()].filter((r) => r.isSeed && !r.dbId && TYPES.includes(r.type) && r.hp >= 2)
        .sort((a, b) => Math.hypot(a.x - BASE.x, a.y - BASE.y) - Math.hypot(b.x - BASE.x, b.y - BASE.y));
      const seen = new Set();
      for (const r of near) {
        if (seen.has(r.type)) continue;
        const h0 = r.hp; me.x = r.x; me.y = r.y;
        H.tryGather(me, r.id);
        const live = H.resources.get(r.id);
        if (live && live.hp < h0 && live.hp > 0) { seen.add(r.type); out.hits.push({ id: r.id, seedKey: r.seedKey, type: r.type, h0, h1: live.hp }); }
      }
      out.ledger = H.seedHp.size;
      await goFar();
      out.offChunk = out.hits.map((h) => H.resources.has(h.id));   // 청크가 꺼져 개체가 빠졌나(빠져야 ⓐ 가 뜻이 있다)
      await goBase();
      for (const h of out.hits) { const r = H.resources.get(h.id); out.after[h.id] = r ? r.hp : null; }
      _l(JSON.stringify(out));
      try { process.kill(process.pid, KILL); } catch (e) {}
      await sleep(5000);
      process.exit(3);
    } else {
      const ids = JSON.parse(process.env.T978_IDS || '[]');
      for (const id of ids) { const r = H.resources.get(id); out.after[id] = r ? r.hp : null; }
      out.ledger = H.seedHp.size;
      _l(JSON.stringify(out));
      process.exit(0);
    }
  })();
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const DBSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone-local-db.js'), 'utf8');
const sub = (env) => {
  const r = spawnSync(process.execPath, [__filename], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 600000 });
  const line = (r.stdout || '').split('\n').filter((l) => l.startsWith('{')).pop();
  return { j: line ? JSON.parse(line) : null, sig: r.signal, code: r.status };
};
const size = (f) => { let n = 0; for (const s of ['', '-wal']) { try { n += fs.statSync(f + s).size; } catch (e) {} } return n; };
const tableHas = (f) => { try { const D = require(path.join(ROOT, 'node_modules', 'better-sqlite3')); const d = new D(f, { readonly: true }); const t = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='seed_hp'").get(); const n = t ? d.prepare('SELECT COUNT(*) n FROM seed_hp').get().n : null; d.close(); return { has: !!t, n }; } catch (e) { return { has: null, err: String(e.message) }; } };

console.log('\n=== 덜 벤 시드 자연물의 hp — 재기동 · 청크 껐다 켬 (T978) ===\n');
console.log('① 술어');
ok(/const _t978On = \(\) => process\.env\.T978_SEED_HP !== '0';/.test(SRC), '`T978_SEED_HP` 는 `!== \'0\'` — 켬 기본 · 되돌림 `=0`');
ok((SRC.match(/process\.env\.T978_SEED_HP/g) || []).length === 1, 'env 를 읽는 자리 하나', (SRC.match(/process\.env\.T978_SEED_HP/g) || []).length);
ok((SRC.match(/else _t978Note\((r|best)\);/g) || []).length === 2, '적는 자리 = 시드 개체 hp 를 깎는 두 자리(NPC 채집 · 플레이어 채집 — DB 개체 `updateResourceHp` 의 else)');
ok(/_t495Forget\(seedKey\);[^\n]*\n\s+_t978Forget\(seedKey\);/.test(SRC) && (SRC.match(/_t978Forget\(seedKey\);/g) || []).length === 2, '지우는 자리 = 부분 수확 장부와 같은 두 자리(벰 · 되살림)');
ok(/_t978Apply\(r\);/.test(SRC) && /e\[0\] === r\.type && e\[1\] > 0 && e\[1\] < r\.hp/.test(SRC), '서는 자리 = `activateChunk` · 같은 종 · 낳은 hp 가 상한');
ok(/CREATE TABLE IF NOT EXISTS seed_hp/.test(DBSRC) && /function _seedHp\(\)/.test(DBSRC), '표는 처음 부를 때 짓는다(끔 = 표 없음)');

const TMP = `/tmp/test-seed-hp-${process.pid}`;
const res = {};
for (const arm of ['on', 'off']) for (const kill of ['SIGTERM', 'SIGKILL']) {
  const DBP = `${TMP}-${arm}-${kill}.db`;
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DBP + s); } catch (e) {} }
  const env = { T978_DBP: DBP, T978_KILL: kill, T978_SEED_HP: arm === 'on' ? '' : '0' };
  const a = sub({ ...env, T978_SUB: 'hit' });
  const dbBytes = size(DBP), tbl = tableHas(DBP);
  const ids = a.j ? a.j.hits.map((h) => h.id) : [];
  const b = sub({ ...env, T978_SUB: 'check', T978_IDS: JSON.stringify(ids) });
  res[arm + '-' + kill] = { a, b, dbBytes, tbl };
}
console.log('② 판 넷(켬 · 끔 × SIGTERM · SIGKILL)');
for (const [k, r] of Object.entries(res)) {
  const hits = (r.a.j && r.a.j.hits) || [];
  console.log(`  · ${k}: 친 개체 ${hits.map((h) => `${h.type} ${h.h0}→${h.h1}`).join(' · ') || '없음'} · 죽음 ${r.a.sig || r.a.code} · DB ${r.dbBytes}B · 표 ${r.tbl.has} 줄 ${r.tbl.n} · 다시 띄움 ${r.b.j ? r.b.j.tUp : '?'}ms(장부 ${r.b.j ? r.b.j.ledger : '?'})`);
}
const on1 = res['on-SIGTERM'], on2 = res['on-SIGKILL'], off1 = res['off-SIGTERM'], off2 = res['off-SIGKILL'];
const hitsOf = (r) => (r.a.j && r.a.j.hits) || [];
ok([on1, on2, off1, off2].every((r) => hitsOf(r).length >= 1 && hitsOf(r).some((h) => h.type === 'tree')), '[상황] 판마다 시드 나무를 쳐서 hp 가 줄었다(0 이 안 됐다)', [on1, on2, off1, off2].map((r) => hitsOf(r).length).join(' · '));
ok([on2, off2].every((r) => r.a.sig === 'SIGKILL') && [on1, off1].every((r) => r.a.sig === 'SIGTERM' || r.a.code === 0), '[상황] 아이는 제 몸에 보낸 신호로 죽었다(SIGKILL = 정리 0 · SIGTERM = 존의 종료 처리가 받아 0 으로 나간다)', [on1, on2, off1, off2].map((r) => r.a.sig || ('code ' + r.a.code)).join(' · '));
ok([on1, on2, off1, off2].every((r) => (r.a.j.offChunk || []).every((x) => x === false)), '[상황] 멀리 가면 그 청크 개체가 세계에서 빠진다(ⓐ 가 뜻이 있다)');
const kept = (r, key) => hitsOf(r).every((h) => r[key].j && r[key].j.after[h.id] === h.h1);
const full = (r, key) => hitsOf(r).every((h) => r[key].j && r[key].j.after[h.id] === h.h0);
ok(kept(on1, 'a') && kept(on2, 'a'), 'ⓐ 켬 — 청크를 껐다 켜도 친 hp 그대로(같은 판 안)');
ok(full(off1, 'a') && full(off2, 'a'), 'ⓐ ★끔 — 청크를 껐다 켜면 온전해진다(종전 결함이 보인다)');
ok(kept(on1, 'b'), '③ ★켬 · SIGTERM — 다시 띄우면 친 hp 그대로', hitsOf(on1).map((h) => `${h.type} ${on1.b.j && on1.b.j.after[h.id]}`).join(' · '));
ok(kept(on2, 'b'), '③ ★켬 · SIGKILL — 다시 띄우면 친 hp 그대로(쓰는 그 순간 DB 에 든다 · 버퍼 0)', hitsOf(on2).map((h) => `${h.type} ${on2.b.j && on2.b.j.after[h.id]}`).join(' · '));
ok(full(off1, 'b') && full(off2, 'b'), '③ ★끔(`=0`) — 다시 띄우면 온전하다(SIGTERM · SIGKILL 둘 다 잃는다 · 결함이 보인다)');
ok(on1.tbl.has === true && on1.tbl.n === hitsOf(on1).length && on2.tbl.n === hitsOf(on2).length, '④ 켬 — `seed_hp` 표 줄 = 친 개체 수(온전한 개체는 안 적는다)', `${on1.tbl.n} · ${on2.tbl.n}`);
ok(off1.tbl.has === false && off2.tbl.has === false, '④ 끔 — `seed_hp` 표가 안 생긴다(DB 무변)');
console.log(`\n  표 ④ — DB(파일 + WAL) 켬 ${on1.dbBytes} · ${on2.dbBytes}B ↔ 끔 ${off1.dbBytes} · ${off2.dbBytes}B · 다시 띄운 판 require→첫 활성 켬 ${on1.b.j && on1.b.j.tUp} · ${on2.b.j && on2.b.j.tUp}ms ↔ 끔 ${off1.b.j && off1.b.j.tUp} · ${off2.b.j && off2.b.j.tUp}ms`);
for (const f of fs.readdirSync('/tmp').filter((x) => x.startsWith(path.basename(TMP)))) { try { fs.unlinkSync(path.join('/tmp', f)); } catch (e) {} }
console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
