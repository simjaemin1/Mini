#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1500] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1500-heap-trim.js — 오래 켠 서버의 힙: 다시 읽을 일이 없는 판은 날이 지나면 버린다(`T1500_HEAP_TRIM`) ==========
//
// ★왜(보고 T1500): 끔 세계 네 해 판이 기본 힙에서 1,246날에 넘쳤다(T1434 회부 3). 스냅숏에서 저장에 안 드는데 날마다 느는 그릇 가운데
//   청크 판 둘(`server/zone.js` `_ringCache` · `_ringCacheRaw`)은 버리는 자리가 없었다. 켬 = 날이 바뀐 첫 틱에(제품 틱 줄 `_t1500Sweep`)
//   ⓐ 오늘 날이 아닌 장부 판을 버리고(읽히면 어차피 다시 낳는 판) ⓑ 오늘 · 어제 안 쓴 원시 판을 버린다(다시 부르면 같은 함수로 다시 낳는다).
// ★이 하네스(존을 아이 프로세스 안에서 띄운다 — `test-recut` 문법 · 관측자 0 · 마을 0 · 시계 손잡이 `__e2e_clock`):
//   날 D0 — 숲 청크 A · B 의 셀을 묻고(장부 판) · A 의 원시 판을 짓고 · A 의 나무 한 그루를 벤다(장부에 든다)
//   날 D0+1 — 틱이 돌게 둔다 → B 를 다시 묻고 · 청크 C 의 원시 판을 짓는다 · 같은 날 한 번 더 훑어도 오늘 판은 남나
//   날 D0+2 — 틱이 돌게 둔다 → A 의 원시 판을 다시 부른다(다시 짓기) · 날 D0+3 — C 를 안 쓴 채 틱
//   ① 켬: 날이 바뀐 뒤 오늘 날이 아닌 장부 판 0 · 오늘 판은 같은 날 다시 훑어도 남는다(읽히는 판을 안 버린다)
//   ② 답 같음: 날마다 묻는 셀 답(종 · 씨 · hp · 자리)이 켬 = 끔 · 켬의 다시 낳은 답 = 장부를 넘긴 색인(`resourcesAtCell`) 답
//   ③ 원시 판: 이틀 안 쓴 A 는 버려지고 다시 부르면 **같은 판**(셀 · 개체 차례 · 칸 전부)으로 다시 선다 · 다시 짓는 값(ms)을 잰다
//   ④ 어제 지은 원시 판(C — 내일 경계 풀림을 위해 미리 짓는 T696 판과 같은 처지)은 오늘 남고 · 이틀 안 쓰면 버려진다
//   ⑤ 끔 = 종전 바이트: 끔 판 = T1500 줄을 지운 사본 판(묻는 답 · 판 크기 · 판 날 · `_ringStat` 셈 — 한 칸도 안 다르다) · 끔 판은 판을 안 버린다(전제)
//   ⑥ 첫 거름 칸(`server/stand-skip.js` T1322): `players` 에서 빠진 몸의 칸은 비운다(죽은 사람 · 나간 사람) · 산 몸의 칸은 그대로
//   미끼 다섯(이 파일 안 — 아이 프로세스가 `server/zone.js` 를 싣는 순간 글자 한 자리를 바꾼다):
//     `today` 장부 판을 오늘 것까지 버림 → ① 빨강 · `yday` 원시 판을 어제 쓴 것까지 버림(아직 읽히는 판) → ④ 빨강 ·
//     `rebuild` 원시 판을 장부를 넘겨 다시 지음(다시 지은 값이 다름) → ③ 빨강 · `offrun` 끔에서도 훑기가 돎 → ⑤ 빨강 ·
//     `alive` 산 몸의 칸까지 비움 → ⑥ 빨강
// 실행: node scripts/test-t1500-heap-trim.js   (아이 여덟 · 셋씩 나란히)
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const ZJS = path.join(ROOT, 'server', 'zone.js');
const SWEEP_LINE = '  if (T1500_HEAP_TRIM) _t1500Sweep();';
const BAITS = {
  today: ['for (const [k, h] of _ringCache) if (!(h.day >= day))', 'for (const [k, h] of _ringCache) if (!(h.day > day))'],
  yday: ['if (!(u >= day - 1)) { _ringCacheRaw.delete(k);', 'if (!(u >= day)) { _ringCacheRaw.delete(k);'],
  rebuild: ['    t = _ringBuild(qx, qy, undefined, undefined);\n    if (T1500_HEAP_TRIM)', '    t = _t1500.gone.has(key) ? _ringBuild(qx, qy, harvestedSeeds, _t1500Day()) : _ringBuild(qx, qy, undefined, undefined);\n    if (T1500_HEAP_TRIM)'],
  offrun: [SWEEP_LINE, '  _t1500Sweep();'],
  alive: ['if (!p || players.get(p.pid) === p || (s < SS.Q.cap', 'if (!p || (s < SS.Q.cap'],
};
// T1500 줄을 지운 사본(⑤ — 종전 글자): 손잡이 줄을 늘 거짓으로 · 훑기 줄 · 미리 짓기 건드림 줄 · 하네스 내보냄 줄을 지운다
function strip(src) {
  let s = src.replace("const T1500_HEAP_TRIM = process.env.T1500_HEAP_TRIM === '1';", 'const T1500_HEAP_TRIM = false;');
  s = s.split('\n').filter((l) => !l.startsWith(SWEEP_LINE)).join('\n');
  s = s.replace(' if (T1500_HEAP_TRIM) _t1500.use.set(chunkManager.keyOf(qx, qy), _t1500Day()); continue; }', ' continue; }');
  s = s.replace('    if (T1500_HEAP_TRIM) _t1500.use.set(key, _t1500Day());\n', '');
  s = s.replace('    const t0 = T1500_HEAP_TRIM ? process.hrtime.bigint() : 0n;\n', '');
  s = s.replace(/    if \(T1500_HEAP_TRIM\) \{ _t1500\.rawBuild\+\+;[^\n]*\n/, '');
  return s;
}

// ── 아이 ──────────────────────────────────────────────────────────────────────────────────
if (process.argv[2] === '--child') {
  const out = { steps: [], err: null };
  const say = (o) => { process.stdout.write('\n@@' + JSON.stringify(o) + '\n'); };
  (async () => {
    const M = require('module'), old = M._extensions['.js'], B = process.env.T1500_BAIT || '';
    if (B) {
      M._extensions['.js'] = function (m, f) {
        if (f !== ZJS) return old(m, f);
        const x = fs.readFileSync(f, 'utf8');
        let y;
        if (B === 'strip') y = strip(x);
        else { const R = BAITS[B]; if (!x.includes(R[0])) { say({ err: '미끼 자리 없음 ' + B }); process.exit(0); } y = x.replace(R[0], R[1]); }
        if (y === x) { say({ err: '사본이 안 바뀜 ' + B }); process.exit(0); }
        m._compile(y, f);
      };
    }
    const TMP = path.join(os.tmpdir(), `t1500-trim-${process.pid}.db`);
    process.on('exit', () => { for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} } });
    Object.assign(process.env, { ZONE_ID: 'hanbando', PORT: String(require('./lib-port').port(39200)), DB_PATH: TMP, ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
    const _l = console.log, _w = console.warn, _e = console.error;
    console.log = () => {}; console.warn = () => {}; console.error = () => {};
    const Zone = require(ZJS);
    const H = Zone.__testBind();
    const CH = require(path.join(ROOT, 'server', 'chunk.js'));
    const Z = require(path.join(ROOT, 'server', 'zone-config.js')).ZONES.hanbando;
    const me = { pid: 'p_t1500', playerId: 'tr_t1500', name: 't1500', persistent: false, ws: { readyState: 1, send: () => {} }, x: 0, y: 0, vx: 0, vy: 0, floor: 0,
      hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: {}, toolItems: [], equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
    const clock = (day) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day, night: false }));
    const ticks = () => new Promise((r) => setTimeout(r, 250));   // 존 틱(30Hz)이 몇 번 돈다 — 제품 틱 줄이 훑는다(켬)
    const CS = CH.CHUNK_SIZE;
    // 숲 청크 셋(대각선 위 · 씨 나무가 선 셀이 있는 청크) — 세계에 물어서 고른다(수를 안 적는다)
    const forest = [];
    const nC = Math.min(Math.floor(Z.zoneWidth / CS), Math.floor(Z.zoneHeight / CS));
    for (let k = 1; k < nC && forest.length < 3; k++) {
      const rows = CH.generateChunkResources('hanbando', Z.biome, k, k, CS, new Set(), 0) || [];
      const t = rows.filter((r) => r.type === 'tree' && r.isSeed && r.seedKey && Math.floor(r.x / CS) === k && Math.floor(r.y / CS) === k);
      if (t.length >= 4) forest.push({ q: [k, k], cells: t.slice(0, 4).map((r) => [Math.floor(r.x / 32), Math.floor(r.y / 32)]) });
    }
    if (forest.length < 3) { say({ err: '숲 청크 셋을 못 찾음' }); process.exit(0); }
    const [A, Bc, C] = forest;
    const kA = H.chunkManager.keyOf(A.q[0], A.q[1]), kB = H.chunkManager.keyOf(Bc.q[0], Bc.q[1]), kC = H.chunkManager.keyOf(C.q[0], C.q[1]);
    const ans = (cells, day) => cells.map((c) => H._idxAtCell(c[0], c[1], false, day).map((e) => [e.type, e.seedKey || e.id, e.hp, Math.round(e.x), Math.round(e.y)]));
    const ref = (cells, day) => cells.map((c) => CH.resourcesAtCell('hanbando', c[0], c[1], { biome: Z.biome, chunkSize: CS, harvestedSet: H.harvestedSeeds, gameDay: day })
      .map((e) => [e.type, e.seedKey || e.id, e.hp, Math.round(e.x), Math.round(e.y)]));
    const rawJ = (k) => { const t = H._ringCacheRaw.get(k); return t ? JSON.stringify([...t]) : null; };
    const view = (tag, day) => {
      const ring = {}; for (const [k, h] of H._ringCache) if ([kA, kB, kC].includes(k)) ring[k === kA ? 'A' : k === kB ? 'B' : 'C'] = h.day;
      const raw = {}; for (const [n, k] of [['A', kA], ['B', kB], ['C', kC]]) raw[n] = H._ringCacheRaw.has(k);
      const st = Object.assign({}, H._ringStat); delete st.us;
      out.steps.push({ tag, day, ring, raw, stale: [...H._ringCache.values()].filter((h) => !(h.day >= day)).length, st });
    };
    const D0 = 1000;
    clock(D0); await ticks();
    out.ansA0 = ans(A.cells, D0); out.ansB0 = ans(Bc.cells, D0);
    H._idxAtCell(A.cells[0][0], A.cells[0][1], true);   // A 의 원시 판(나무를 베기 전)
    out.rawA0 = rawJ(kA);
    out.cut = H.clearTreesInCells(new Set([A.cells[0][0] + ',' + A.cells[0][1]]));   // A 의 한 그루를 벤다(장부에 든다 · 판은 그 셀만 고친다)
    out.ansA0c = ans(A.cells, D0);
    view('D0', D0);
    clock(D0 + 1); await ticks();
    view('D1 훑은 뒤', D0 + 1);
    out.ansB1 = ans(Bc.cells, D0 + 1);
    out.refB1 = ref(Bc.cells, D0 + 1);
    H._idxAtCell(C.cells[0][0], C.cells[0][1], true);   // C 의 원시 판(어제 지어 오늘 쓰는 판과 같은 처지)
    out.rawC1 = rawJ(kC);
    if (H.T1500_HEAP_TRIM) { H._t1500.day = null; H._t1500Sweep(); }   // 같은 날 한 번 더 훑는다(오늘 판은 남아야 한다)
    view('D1 다시 훑음', D0 + 1);
    out.ansA1 = ans(A.cells, D0 + 1); out.refA1 = ref(A.cells, D0 + 1);
    clock(D0 + 2); await ticks();
    view('D2 훑은 뒤', D0 + 2);
    const rb0 = H._t1500 ? H._t1500.rawRebuild : 0, rbUs0 = H._t1500 ? H._t1500.rawRebuildUs : 0;
    H._idxAtCell(A.cells[1][0], A.cells[1][1], true);   // A 의 원시 판을 다시 부른다
    out.rawA2 = rawJ(kA);
    out.rebuild = H._t1500 ? { n: H._t1500.rawRebuild - rb0, ms: +((H._t1500.rawRebuildUs - rbUs0) / 1000).toFixed(3) } : null;
    out.ansA2 = ans(A.cells, D0 + 2); out.ansB2 = ans(Bc.cells, D0 + 2); out.refA2 = ref(A.cells, D0 + 2);
    view('D2 다시 부름', D0 + 2);
    clock(D0 + 3); await ticks();
    view('D3 훑은 뒤', D0 + 3);
    // 첫 거름 칸(stand-skip) — 빠진 몸 X · 산 몸 Y(존이 낳는 몸과 같은 문 `install` · `players` 쓰기)
    {
      const SS = require(path.join(ROOT, 'server', 'stand-skip'));
      const mk = (pid) => Object.assign({}, me, { pid, playerId: 'tr_' + pid, isNpc: true, ws: null });
      const X = mk('t1500_gone'), Y = mk('t1500_live');
      SS.install(X); SS.install(Y); H.players.set(X.pid, X); H.players.set(Y.pid, Y); H.players.delete(X.pid);
      const sx = SS.slot(X.pid), sy = SS.slot(Y.pid);
      if (H.T1500_HEAP_TRIM) { H._t1500.day = null; H._t1500Sweep(); }
      out.ss = { on: SS.ON, sx: sx >= 0, sy: sy >= 0, xOwn: SS.own[sx] === X, yOwn: SS.own[sy] === Y, xSlot: SS.slot(X.pid) === sx, ySlot: SS.slot(Y.pid) === sy, n: SS.count() };
      H.players.delete(Y.pid);
    }
    out.on = !!H.T1500_HEAP_TRIM;
    out.trim = H._t1500 ? { ringDrop: H._t1500.ringDrop, rawDrop: H._t1500.rawDrop, rawBuild: H._t1500.rawBuild, rawRebuild: H._t1500.rawRebuild } : null;
    say(out);
    process.exit(0);
  })().catch((e) => { say({ err: String((e && e.stack) || e).slice(0, 600) }); process.exit(0); });
  return;
}

// ── 부모 ─────────────────────────────────────────────────────────────────────────────────
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다
let pass = 0, fail = 0;
const ok = (c, name, info) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${name}${info != null && info !== '' ? '  ' + info : ''}`); };
const kid = (env) => new Promise((resolve) => {
  const ch = spawn(process.execPath, [__filename, '--child'], { cwd: ROOT, env: Object.assign({}, process.env, { T1500_HEAP_TRIM: '', T1500_BAIT: '' }, env), stdio: ['ignore', 'pipe', 'pipe'] });
  let buf = ''; ch.stdout.on('data', (d) => { buf += d; }); ch.stderr.on('data', () => {});
  const to = setTimeout(() => { try { ch.kill('SIGKILL'); } catch (e) {} }, 600000);
  ch.on('exit', () => { clearTimeout(to); const m = buf.split('\n').filter((l) => l.startsWith('@@')).pop(); try { resolve(JSON.parse(m.slice(2))); } catch (e) { resolve({ err: '아이 출력 없음 ' + buf.slice(-300) }); } });
});
const J = (x) => JSON.stringify(x);
const step = (o, tag) => (o && o.steps ? o.steps.find((s) => s.tag === tag) : null) || {};
// 판정 — 미끼 판에도 같은 함수를 쓴다
const q1 = (o) => !!(o && o.on && step(o, 'D1 훑은 뒤').stale === 0 && step(o, 'D2 훑은 뒤').stale === 0 && step(o, 'D3 훑은 뒤').stale === 0 &&
  step(o, 'D1 훑은 뒤').ring.A === undefined && step(o, 'D1 다시 훑음').ring.B === step(o, 'D1 다시 훑음').day);
const q2 = (o, off) => !!(o && off && !o.err && J([o.ansA0, o.ansB0, o.ansA0c, o.ansB1, o.ansA1, o.ansA2, o.ansB2]) === J([off.ansA0, off.ansB0, off.ansA0c, off.ansB1, off.ansA1, off.ansA2, off.ansB2]) &&
  J(o.ansA1) === J(o.refA1) && J(o.ansB1) === J(o.refB1) && J(o.ansA2) === J(o.refA2) && J(o.ansA0) !== J(o.ansA0c));
const q3 = (o) => !!(o && o.on && step(o, 'D2 훑은 뒤').raw.A === false && o.rawA0 && o.rawA2 === o.rawA0 && o.rebuild && o.rebuild.n === 1);
const q4 = (o) => !!(o && o.on && step(o, 'D2 훑은 뒤').raw.C === true && step(o, 'D3 훑은 뒤').raw.C === false);
const q6 = (o) => !!(o && o.on && o.ss && o.ss.on && o.ss.sx && o.ss.sy && !o.ss.xOwn && !o.ss.xSlot && o.ss.yOwn && o.ss.ySlot);
const q5 = (o, s) => !!(o && s && !o.err && !s.err && !o.on && J(o.steps) === J(s.steps) && J(o.ss) === J(s.ss) && J([o.ansA0, o.ansA0c, o.ansB1, o.ansA1, o.ansA2, o.ansB2, o.rawA0, o.rawA2, o.rawC1]) === J([s.ansA0, s.ansA0c, s.ansB1, s.ansA1, s.ansA2, s.ansB2, s.rawA0, s.rawA2, s.rawC1]));
(async () => {
  const t0 = Date.now();
  console.log('[T1500] 오래 켠 서버의 힙 — 다시 읽을 일이 없는 청크 판은 날이 지나면 버린다(T1500_HEAP_TRIM) · 숲 청크 셋 · 날 넷');
  const par = async (list) => { const r = []; for (let i = 0; i < list.length; i += 3) r.push(...await Promise.all(list.slice(i, i + 3).map(kid))); return r; };
  const [on, off, stripped, bToday, bYday, bRebuild, bOffrun, bAlive] = await par([{ T1500_HEAP_TRIM: '1' }, {}, { T1500_BAIT: 'strip' },
    { T1500_HEAP_TRIM: '1', T1500_BAIT: 'today' }, { T1500_HEAP_TRIM: '1', T1500_BAIT: 'yday' }, { T1500_HEAP_TRIM: '1', T1500_BAIT: 'rebuild' }, { T1500_BAIT: 'offrun' }, { T1500_HEAP_TRIM: '1', T1500_BAIT: 'alive' }]);
  for (const [n, o] of [['켬', on], ['끔', off], ['지운 사본', stripped]]) if (o.err) console.log(`  · ${n} 아이 오류: ${o.err}`);
  ok(!off.err && !off.on && step(off, 'D1 훑은 뒤').ring.A === 1000 && step(off, 'D3 훑은 뒤').raw.C === true && step(off, 'D3 훑은 뒤').stale > 0,
    '[전제] 끔: 옛 날 장부 판 · 안 쓰는 원시 판이 그대로 남는다(종전 — 버리는 자리가 없다)', off.err || J(step(off, 'D3 훑은 뒤')));
  ok(!on.err && on.cut === 1, '[전제] 켬 아이가 섰고 A 의 한 그루를 벴다(장부에 듦 — 다시 낳은 답이 장부를 봐야 하는 판)', on.err || `벤 그루 ${on.cut}`);
  ok(q1(on), '★① 켬: 날이 바뀐 뒤 오늘 날이 아닌 장부 판 0 · 오늘 판은 같은 날 다시 훑어도 남는다', J(on.steps && on.steps.map((s) => [s.tag, s.stale, s.ring])));
  ok(q2(on, off), '★② 답 같음: 날마다 묻는 셀 답이 켬 = 끔 · 켬이 다시 낳은 답 = 장부를 넘긴 색인 답(벤 그루가 그루터기로)', `셀 ${on.ansA0 ? on.ansA0.length + on.ansB0.length : 0}`);
  ok(q3(on), '★③ 원시 판: 이틀 안 쓴 판은 버려지고 다시 부르면 같은 판(셀 · 개체 차례 · 칸 전부)으로 선다', on.rebuild ? `다시 지음 ${on.rebuild.n} · ${on.rebuild.ms} ms` : '');
  ok(q4(on), '★④ 어제 지은 원시 판(내일 경계용 미리 짓기와 같은 처지)은 오늘 남고 · 이틀 안 쓰면 버려진다', J([step(on, 'D2 훑은 뒤').raw, step(on, 'D3 훑은 뒤').raw]));
  ok(q6(on), '★⑥ 첫 거름 칸: players 에서 빠진 몸(죽은 사람 · 나간 사람)의 칸은 비우고 · 산 몸의 칸은 그대로(같은 칸 · 같은 몸)', J(on.ss));
  ok(off.ss && off.ss.xOwn, '[전제] 끔: 빠진 몸을 칸이 그대로 쥔다(종전 — 낳을 때마다 새 칸 · 비우는 자리가 없다)', J(off.ss));
  ok(q5(off, stripped), '★⑤ 끔 = 종전 바이트: 끔 판 = T1500 줄을 지운 사본 판(답 · 판 크기 · 판 날 · 판 셈 — 한 칸도 안 다르다)', stripped.err || `단계 ${off.steps ? off.steps.length : 0}`);
  // ── 미끼 넷 ─────────────────────────────────────────────────────────────────────────
  ok(!bToday.err && !q1(bToday), '[미끼 today] 바꾼 자리 1곳(장부 판을 오늘 것까지 버림 — 읽히는 판을 버리는 사본) → ① 빨강', bToday.err || '');
  ok(!bYday.err && !q4(bYday), '[미끼 yday] 바꾼 자리 1곳(원시 판을 어제 쓴 것까지 버림 — 오늘 경계가 아직 읽는 판) → ④ 빨강', bYday.err || '');
  ok(!bRebuild.err && !q3(bRebuild), '[미끼 rebuild] 바꾼 자리 1곳(버린 원시 판을 장부를 넘겨 다시 지음 — 다시 지은 값이 다른 사본) → ③ 빨강', bRebuild.err || '');
  ok(!bOffrun.err && !q5(bOffrun, stripped), '[미끼 offrun] 바꾼 자리 1곳(끔에서도 틱이 훑음 — 끔 판이 한 칸이라도 다른 사본) → ⑤ 빨강', bOffrun.err || '');
  ok(!bAlive.err && !q6(bAlive), '[미끼 alive] 바꾼 자리 1곳(산 몸의 칸까지 비움 — 아직 읽히는 칸을 버리는 사본) → ⑥ 빨강', bAlive.err || J(bAlive.ss));
  console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL · ${((Date.now() - t0) / 1000).toFixed(0)}초 ===\n`);
  process.exit(fail ? 1 : 0);
})();
