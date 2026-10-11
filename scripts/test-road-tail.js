#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-road-tail.js — T696 ② WAL 체크포인트를 COMMIT 밖으로(`server/zone-local-db.js` · 손잡이 `T696_ROAD_TAIL`) ==============
//
//   ① 켬: 이 연결의 자동 체크포인트가 꺼진다(`wal_autocheckpoint = 0`) · 일꾼 스레드가 선다 · 끔은 종전 그대로(1,000)
//   ② 같은 쓰기 줄(길 표 upsert/delete · 장부 insert — 묶음 거래 + 자동 커밋)을 끔 DB · 켬 DB 에 먹이면 두 DB 의 표가 같다
//   ③ 켬은 옮기지 않은 프레임이 문턱을 넘을 때 일꾼이 PASSIVE 체크포인트를 돈다(프레임이 실제로 옮겨진다 — nBackfill 이 오른다)
//   ④ 켬의 COMMIT 은 체크포인트를 안 문다 — 끔은 문턱을 넘긴 COMMIT 이 체크포인트를 돈다(그 COMMIT 들의 몫을 표로)
//   ⑤ 자명 통과 금지 — 일꾼을 안 부르면(walTick 안 부름) WAL 이 문턱 너머로 자란다(켬이 일꾼에 기대는 것이 실제다)
//   ⑥ [`T696_REAL_DB=<틀>`] 실제 크기 틀에서 한 경계에 다져진 길 수백 셀을 풀 때 끔 ↔ 켬의 풀림 셈 · 메모리 장부 · DB 행이 같다
//   (아이 프로세스 — 모듈이 env 를 적재 때 읽는다)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };

if (process.argv[2] === '--child') {
  // 아이: 같은 쓰기 줄을 먹이고 결과를 JSON 으로
  const mode = process.argv[3], tick = process.argv[4] !== 'notick';
  const L = require(path.join(ROOT, 'server', 'zone-local-db.js'));
  const D = L.db, P = require('perf_hooks').performance;
  const auto = D.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint;
  let rs = 696; const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; };
  const commits = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shm = () => { try { const b = Buffer.alloc(136); const fd = fs.openSync(process.env.DB_PATH + '-shm', 'r'); fs.readSync(fd, b, 0, 136, 0); fs.closeSync(fd); return { mx: b.readUInt32LE(16), bf: b.readUInt32LE(96) }; } catch (e) { return null; } };
  (async () => {
    let maxPend = 0, backfillUp = 0, lastBf = 0;
    for (let day = 0; day < 40; day++) {
      // 길 하루 플러시 꼴 — 묶음 거래(행 600 · 무작위 키 = 쪽이 흩어진다)
      for (let b = 0; b < 6; b++) {
        D.exec('BEGIN');
        for (let i = 0; i < 600; i++) { const k = (rnd() * 4e6) | 0; if (rnd() < 0.05) L.deleteRoadCell('thr', k); else L.upsertRoadCell('thr', k, +(1 + rnd() * 100).toFixed(6), day); }
        const t0 = P.now(); D.exec('COMMIT'); commits.push(P.now() - t0);
        if (tick) L.walTick();
        await sleep(2);   // 일꾼이 돌 틈(틱 사이 꼴)
        const h = shm(); if (h) { if (h.mx - h.bf > maxPend) maxPend = h.mx - h.bf; if (h.bf > lastBf) backfillUp++; lastBf = h.bf; }
      }
      // 장부 꼴 — 자동 커밋 한 줄씩
      for (let i = 0; i < 30; i++) { const t0 = P.now(); L.insertHarvestedSeed('s' + ((rnd() * 1e5) | 0), day); commits.push(P.now() - t0); if (tick) L.walTick(); }
    }
    for (let i = 0; i < 200 && L.walPerf && L.walPerf() && L.walPerf().busy; i++) await sleep(5);
    const rows = D.prepare('SELECT cell_key, v, d FROM roads ORDER BY cell_key').all().map((r) => r.cell_key + ':' + r.v + ':' + r.d).join(',');
    const seeds = D.prepare('SELECT seed_key, harvested_day FROM harvested_seeds ORDER BY seed_key').all().map((r) => r.seed_key + ':' + r.harvested_day).join(',');
    const cs = commits.slice().sort((a, b) => a - b);
    const out = { mode, auto, wal: L.walPerf ? L.walPerf() : null, rows: require('crypto').createHash('sha1').update(rows).digest('hex'), nRows: rows.split(',').length,
      seeds: require('crypto').createHash('sha1').update(seeds).digest('hex'), maxPend, backfillUp, commitMax: +cs[cs.length - 1].toFixed(2), commitP99: +cs[Math.floor(cs.length * 0.99)].toFixed(2), commitOver5: cs.filter((x) => x > 5).length, nCommit: cs.length };
    process.stdout.write('@@' + JSON.stringify(out) + '\n');
    process.exit(0);
  })();
  return;
}

if (process.argv[2] === '--real') {
  // 아이(⑥): 실제 크기 틀을 이 프로세스 안에 띄워(마을 켬 · 관측자 0) 다져진 길 셀 수백 개를 한 경계에 풀고 장부를 적어 낸다.
  //   팔 둘 — off(T696 끔 = 오늘 main 글자) · on(켬 · 술어 차례 + 원시 판 미리 짓기) — 둘의 결과가 같아야 한다.
  const [db, arm] = [process.argv[3], process.argv[4]];
  Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(41200 + (process.pid % 150)), DB_PATH: db, ENABLE_VILLAGES: '1', ENABLE_WILDLIFE: '0',
    ENABLE_BANDITS: '0', E2E_GIVE: '1', ENABLE_ROADS: '1', VILLAGE_WAR_LOG: '0', T696_ROAD_TAIL: arm === 'off' ? '0' : '1' });
  const _o = process.stdout.write.bind(process.stdout);
  console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sha = (s) => require('crypto').createHash('sha1').update(s).digest('hex');
  (async () => {
    const Zone = require(path.join(ROOT, 'server', 'zone.js'));
    const H = Zone.__testBind();
    for (let i = 0; i < 2400; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(250); }
    const R = H.Roads, S = R._S;
    for (let i = 0; i < 400 && !S.ready; i++) await sleep(250);
    await sleep(1500);
    // 같은 셀을 고른다 — 다져진 길 키를 정렬해 8개 연달아(둘레가 겹치게) · 띄엄띄엄
    //   ① 둘레(영토 밖 셀)에 장부 나무 씨가 선 다져진 길 셀(장부 청크 안만 훑는다) + 그 체비쇼프 4 안 다져진 길 전부(남은 길이 둘레를 막지 않게 · 둘레가 겹친다)
    //   ② 모자라면 정렬한 키에서 8개 연달아 띄엄띄엄 — 합 ≤ 480
    const keys = [...S.paved].sort((a, b) => a - b), W = S.cellsW, tNow = Math.floor((Date.now() - S.epoch) / S.dayMs);
    const CH = require(path.join(ROOT, 'server', 'chunk.js'));
    const led = new Set(); for (const k of H.harvestedSeeds.keys()) { const i = k.indexOf('_'), j = k.indexOf('_', i + 1); if (i > 0 && j > i) led.add(k.slice(0, j)); }
    const inLed = (x, y) => { const q = CH.cellChunksOf(x, y, CH.CHUNK_SIZE); for (let i = 0; i < q.length; i += 2) if (led.has(q[i] + '_' + q[i + 1])) return true; return false; };
    const sel = new Set(); let cand = 0;
    for (const k of keys) { if (cand >= 40 || sel.size >= 400) break; const cx = k % W, cy = (k / W) | 0; if (!inLed(cx, cy)) continue;
      let hit = false; for (let y = cy - 2; y <= cy + 2 && !hit; y++) for (let x = cx - 2; x <= cx + 2 && !hit; x++) { let a = []; try { a = H._idxAtCell(x, y, true) || []; } catch (e) {} let vil = false; try { vil = !!H.SimVillages.villageOfCell(x, y); } catch (e) {} if (vil) continue; for (const e of a) if (e.type === 'tree' && e.isSeed && e.seedKey && H.harvestedSeeds.has(e.seedKey)) { hit = true; break; } }
      if (!hit) continue; cand++;
      for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) { const kk = y * W + x; if (S.paved.has(kk)) sel.add(kk); } }
    const stride = Math.max(1, Math.floor(keys.length / 8 / 60));
    for (let i = 0; i < keys.length && sel.size < 480; i++) if (Math.floor(i / 8) % stride === 0) sel.add(keys[i]);
    const pick = [...sel].sort((a, b) => a - b);
    H._ringCacheRaw.clear();   // 고르며 지은 원시 판을 버린다(셋 다 같은 찬 캐시에서 경계를 맞는다 · 판은 다시 지으면 같은 값)
    // ⚠ 경계 전 장부를 지금 찍고(셋이 같은 판에서 시작했는지) · 고친 값과 풀기는 한 동기 덩이(존 틱이 끼지 않는다)
    const dump = () => { const m = H.harvestedSeeds; const a = []; for (const [k, v] of m) a.push(k + ':' + (typeof v === 'object' ? JSON.stringify(v) : v)); return a; };
    const before = dump().sort(), st0 = Object.assign({}, H._t566Stat);
    for (const k of pick) { const r = S.cells.get(k); if (!r) continue; r.d = tNow - 400; R.retouchCell(k % W, (k / W) | 0); }
    let pre = null;
    if (arm !== 'off') { const b0 = H._t696Pre.built, t0 = Date.now(); H._t696Pre.day = -1; H._t696Pre.q.length = 0;
      for (let i = 0; i < 20000 && (i === 0 || H._t696Pre.i < (H._t696Pre.keys || []).length || H._t696Pre.q.length); i++) H._t696Prebuild();
      pre = { built: H._t696Pre.built - b0, ms: Date.now() - t0, soon: (H._t696Pre.keys || []).length }; }
    const p0 = require('perf_hooks').performance.now();
    S.lastDay = -1; R.onGameTick(Date.now());
    const hookMs = require('perf_hooks').performance.now() - p0;
    //   풀린 날 = 존의 게임 날(`_markHarvested`) — 바뀐 씨의 새 값에서 읽어 R 로 적는다(세 판이 다른 시각에 돌아도 견줄 수 있게)
    const afterRaw = dump().sort(), ch = afterRaw.filter((s, i) => s !== before[i]);
    const days = [...new Set(ch.map((s) => s.slice(s.lastIndexOf(':') + 1)))], dRel = days.length === 1 ? days[0] : null;
    const after = afterRaw.map((s) => (dRel != null && s.endsWith(':' + dRel)) ? s.slice(0, s.lastIndexOf(':')) + ':R' : s);
    const st = {}; for (const k of ['unpaved', 'released', 'relSeeds', 'relEmpty']) st[k] = (H._t566Stat[k] || 0) - (st0[k] || 0);
    const changed = after.filter((s, i) => s !== before[i]).length;
    await sleep(3000);   // DB 쓰기 큐
    const rows = H.db.getAllHarvestedSeeds().map((r) => r.seed_key + ':' + (dRel != null && String(r.harvested_day) === dRel ? 'R' : r.harvested_day)).sort();
    _o('@@' + JSON.stringify({ arm, paved: keys.length, pick: pick.length, cand, pre, hookMs: +hookMs.toFixed(1), st, nSeeds: before.length, before: sha(before.join(',')), after: sha(after.join(',')), changed,
      rows: sha(rows.join(',')), nRows: rows.length, relDays: days.length, sameLen: afterRaw.length === before.length, relR: rows.filter((s) => s.endsWith(':R')).length }) + '\n');
    process.exit(0);
  })();
  return;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't696-'));
const run = (mode, extra) => {
  const db = path.join(TMP, mode + '.db');
  const r = spawnSync(process.execPath, [__filename, '--child', mode, extra || ''], { env: Object.assign({}, process.env, { DB_PATH: db, ZONE_ID: 'thr', T696_ROAD_TAIL: mode === 'off' ? '0' : '1' }), encoding: 'utf8', timeout: 240000 });
  const line = (r.stdout || '').split('\n').find((x) => x.startsWith('@@'));
  if (!line) { console.log(r.stdout, r.stderr); return null; }
  return JSON.parse(line.slice(2));
};
console.log('\n① · ② · ③ · ④ 끔 ↔ 켬 — 같은 쓰기 줄');
const A = run('off'), B = run('on');
ok(A && A.auto > 0 && (!A.wal || !A.wal.on), '① 끔 — 자동 체크포인트 그대로(종전)', A && `wal_autocheckpoint ${A.auto}`);
ok(B && B.auto === 0 && B.wal && B.wal.on && B.wal.n === A.auto, '① 켬 — 이 연결의 자동 체크포인트 0 · 일꾼이 선다 · 문턱 = 끔이 읽은 그 값', B && `wal_autocheckpoint ${B.auto} · 일꾼 문턱 ${B.wal && B.wal.n}`);
ok(A && B && A.rows === B.rows && A.seeds === B.seeds && A.nRows > 1000, '② ★두 DB 의 표가 같다(길 표 · 장부 — 행 · 값)', A && B && `길 ${A.nRows}행 · ${A.rows.slice(0, 8)} = ${B.rows.slice(0, 8)} · 장부 ${A.seeds.slice(0, 8)} = ${B.seeds.slice(0, 8)}`);
ok(B && B.wal.done > 0 && B.backfillUp > 0 && B.wal.err === 0, '③ ★켬 — 일꾼이 체크포인트를 돌았고 프레임이 실제로 옮겨졌다(nBackfill 오름)', B && `일꾼 ${B.wal.done}번 · 합 ${B.wal.ms}ms · 최대 ${B.wal.maxMs}ms · 옮긴 프레임 ${B.wal.frames} · nBackfill 오른 번 ${B.backfillUp}`);
console.log(`    ↳ COMMIT(자동 커밋 포함 ${A && A.nCommit}번) — 끔 최대 ${A && A.commitMax}ms · p99 ${A && A.commitP99} · 5ms 넘음 ${A && A.commitOver5} ‖ 켬 최대 ${B && B.commitMax}ms · p99 ${B && B.commitP99} · 5ms 넘음 ${B && B.commitOver5}(이 상자 디스크 · 표만)`);
ok(B && A && B.commitOver5 <= A.commitOver5, '④ 켬의 COMMIT 은 체크포인트를 안 문다 — 5ms 넘는 COMMIT 이 끔보다 많지 않다', B && A && `${B.commitOver5} ≤ ${A.commitOver5}`);
console.log('\n⑤ 자명 통과 금지');
const C = run('on', 'notick');
ok(C && C.auto === 0 && C.wal.done === 0 && C.maxPend >= 2 * C.wal.n, '⑤ 켬인데 일꾼을 안 부르면 WAL 이 문턱 너머로 자란다(옮기지 않은 프레임 최대 ≥ 문턱 × 2) — 켬은 일꾼에 기댄다', C && `옮기지 않은 프레임 최대 ${C.maxPend} · 문턱 ${C.wal.n}`);
ok(B && B.maxPend < C.maxPend, '⑤ [대조] 일꾼을 부르면 그보다 작다', B && C && `${B.maxPend} < ${C.maxPend}`);
console.log('\n⑥ [실제 크기 · `T696_REAL_DB=<틀>`] 한 경계에 다져진 길 수백 셀을 풀 때 — 끔 ↔ 켬 같은 값');
if (!process.env.T696_REAL_DB) console.log('  · [건너뜀] 틀 DB 없음(세지 않는다)');
else {
  const arms = {};
  for (const arm of ['off', 'on']) {
    const d = path.join(TMP, 'real-' + arm); fs.mkdirSync(d);
    for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(process.env.T696_REAL_DB + s, path.join(d, 'z.db' + s)); } catch (e) {} }
    const r = spawnSync(process.execPath, [__filename, '--real', path.join(d, 'z.db'), arm], { env: Object.assign({}, process.env), encoding: 'utf8', timeout: 600000, maxBuffer: 1 << 26 });
    const line = (r.stdout || '').split('\n').find((x) => x.startsWith('@@'));
    arms[arm] = line ? JSON.parse(line.slice(2)) : null;
    if (!line) console.log((r.stdout || '').slice(-800), (r.stderr || '').slice(-800));
    try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) {}
  }
  const A = arms.off, B = arms.on;
  pre(A && B && A.before === B.before, '둘이 같은 장부에서 시작(경계 전)', A && `씨 ${A.nSeeds} · 다져진 길 ${A.paved} · 고른 셀 ${A.pick}(둘레에 장부 씨 선 길 ${A.cand} 곳 + 그 곁 길)`);
  ok(A && B && A.st.unpaved >= 300 && A.st.relSeeds > 0 && JSON.stringify(A.st) === JSON.stringify(B.st),
    '⑥ ★풀림 셈이 같다(내린 셀 · 풀린 셀 · 장부 씨 · 빈 셀)', A && B && `끔 ${JSON.stringify(A.st)} · 켬 ${JSON.stringify(B.st)}`);
  ok(A && B && A.after === B.after && A.changed > 0 && A.relDays === 1 && A.sameLen, '⑥ ★메모리 장부(벤 날 · 풀린 날 = R)가 같다', A && B && `바뀐 씨 ${A.changed} · ${A.after.slice(0, 8)} = ${B.after.slice(0, 8)}`);
  ok(A && B && A.rows === B.rows && A.relR > 0, '⑥ ★DB 행이 같다(`harvested_seeds`)', A && B && `행 ${A.nRows} · 풀린 날 행 ${A.relR} · ${A.rows.slice(0, 8)} = ${B.rows.slice(0, 8)}`);
  ok(B && B.pre && B.pre.built > 0, '⑥ 켬은 경계 전에 원시 판을 미리 지었다(자명 통과 금지)', B && B.pre && `내일 풀릴 셀 ${B.pre.soon} · 판 ${B.pre.built} · ${B.pre.ms}ms`);
  console.log(`    ↳ 경계 길 훅(풀림 콜백 포함 · 이 상자) — 끔 ${A && A.hookMs}ms · 켬 ${B && B.hookMs}ms(표만 · 판마다 찬 JIT)`);
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
