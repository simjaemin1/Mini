#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1324-xz-migrate.js — 주민이 존을 넘어 이주한다(첫 꼴 · 손잡이 `T1324_XZ_MIGRATE`) — 두 존 보존 · 둘 0 · 사라짐 0 · 모르는 곳 0 ==========
//
// ★왜(T1324 할 일 4 · 6): 이웃 존으로 떠나는 사람은 econ 명부에서 빠져 길 위 줄로만 산다 — 그 줄이 문(캐러밴 문 · 기록 `kind: 'migrant'`)을 건너며
//   사라지거나(보내는 존이 답 전에 줄을 지움) 둘이 되면(받는 존이 같은 사람을 두 번 받음) 두 존 사람 합이 틀어진다.
// 판(운영 함수 그대로 — `__t1324Probe` 의 고르기 · 떠나기 · 하루 + `xzoneReceive` 받는 문): 아이 둘(한반도 A · 닛폰 B — 각각 villages.js 한 벌)을 부모가 잇는다.
//   A 의 `xzonePost` = 부모에게 글을 넘기고 부모가 B 의 `xzoneReceive` 답을 돌려준다(부모가 답을 잃거나 · 연결 안 섬으로 바꾸거나 · 늦출 수 있다).
//   ① 고르기 — 들은 줄(캐러밴이 들고 온 이웃 존 마을)이 더 행복하면 그 마을을 고른다 · 소식이 아직 길 위면(`at` > 오늘) · 들은 적 없으면 · 정보 반경 밖이면 안 고른다
//   ② 한 번 넘김 — 떠남(A 명부 −1 · 줄 1) → 경계 칸에 닿은 날 글 → B 받음(줄 1) → A 줄 0 → B 닿음(B 명부 +1 · 줄 0) · 사람 번호는 B 계수기 · 옛 번호 `_t1324From`
//   ③ 답 잃음 → A 숨긴 채(모름) → 다음 하루 같은 열쇠 → B `dup`(길 위 줄 · 받은 열쇠) → A 줄 0 · B 사람 하나
//   ④ 받는 존 거절(마을 빔) → A 집으로 되돌아 걷기 → 닿으면 A 명부 +1(처음 수 그대로)
//   ⑤ 첫 글 연결 안 섬 → 되돌림 · 앞 글 모름 뒤 연결 안 섬 → 숨긴 채(모름 규칙)
//   ⑥ 보내는 존 재기동 — 메타 곁 칸(`pack`) → 새 판 되돌림 → 다시 밂 → B `dup`(이미 받았다) — 둘 0
//   ⑦ 받는 존 재기동 — B 메타 곁 칸 → 새 판 되돌림 → 닿음(사람 하나)
//   ⑩ 가던 마을이 걷는 사이 빔 — 받는 마을(받는 존 안) · 집(되돌아 걷는 사이 · 집 존 안) → T1080 그 다시 고르기(`_t1080Reroute`)로 다음 산 마을에 닿는다
//   두 존 합(사람 = 두 존 명부 + 두 존 길 위 줄) = 처음 수 — 판마다 마지막에 본다
//   미끼(아이 안 · 파일 무변): ㉠ 답 전에 줄을 지우는 사본 → ④ 사라짐 빨강 · ㉡ 받는 존이 같은 사람을 두 번 받는 사본 → ③ 둘 빨강 · ㉢ 다시 고르기를 뺀 사본 → ⑩1 빨강
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { fork } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  early: ["  w.ph = 'sent'; w.tries = (w.tries | 0) + 1; _t1324Hide(w, true); _t1324Stat.sent++; _t1324Mark();",
    "  { const W0 = _t1324Rows(), j0 = W0.indexOf(w); if (j0 >= 0) W0.splice(j0, 1); } w.ph = 'sent'; w.tries = (w.tries | 0) + 1; _t1324Hide(w, true); _t1324Stat.sent++; _t1324Mark();   // 미끼"],
  twice: ["  if (X.seen.has(sk)) { X.st.dup++; return { ok: true, dup: true }; }   // 같은 기록을 두 번 받았다(답이 늦어 다시 민 것) — 한 번만 센다",
    "  if (X.seen.has(sk) && r.kind !== 'migrant') { X.st.dup++; return { ok: true, dup: true }; }   // 미끼"],
  noreroute: ["      if (w.ph !== 'out') _t1324Reroute(w, day);", "      /* 미끼 — 다시 고르기 뺌 */"],
  twice2: ["  if (_t1324Rows().some((x) => x.key === r.id) || (state.villages || []).some((v) => v.econ && Array.isArray(v.econ._t1324Got) && v.econ._t1324Got.includes(r.id))) {",
    "  if (false) {"],
};

// ── 아이 — 존 하나(villages.js 한 벌) ───────────────────────────────────────────────
if (process.argv[2] === '--child') {
  const ZONE = process.argv[3], PEER = ZONE === 'hanbando' ? 'nippon' : 'hanbando';
  const baits = (process.argv[4] || '-').split(',').filter((b) => b && b !== '-').map((b) => BAITS[b]);
  if (baits.length) {
    const old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      let src = fs.readFileSync(f, 'utf8');
      for (const b of baits) { if (src.split(b[0]).length !== 2) { process.send({ t: 'err', err: '미끼 자리가 한 번이 아니다: ' + b[0].slice(0, 60) }); process.exit(3); } src = src.replace(b[0], b[1]); }
      m._compile(src, f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  const V = require(VFILE), E1 = require(path.join(ROOT, 'sim', 'economy-sim')), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const H = V.__p3Bind({}), S = H.state, P = V.__t1324Probe;
  const M = 240000, G0 = 4800, D0 = 100, E0 = 1.6e12;
  let CLK = E0 + (G0 + 0.3) * M; Date.now = () => CLK;
  const w = mute(() => E2.createWorldV2({ seed: ZONE === 'hanbando' ? 7 : 9, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
  w.day = D0; w.caravans = [];
  const [a, b] = w.villages;
  for (const e of [a, b]) { e.lastStats = Object.assign({}, e.lastStats, { happiness: 0.2 }); e.housing = 999; e._mapBeds = 999; e.storage.food = Math.max(e.storage.food || 0, 5000); }
  b.lastStats.happiness = 0.25;   // 제 존 다른 마을 — 떠나는 마을보다 조금 행복(이웃 존 들은 줄이 더 행복하면 그쪽)
  const ZA = ZONE === 'hanbando' ? 'A' : 'B';
  const vA = { dbId: 1, name: ZA + '마을1', ccx: 10, ccy: 10, npcPids: [], econ: a, housesPx: [] }, vB = { dbId: 2, name: ZA + '마을2', ccx: 40, ccy: 22, npcPids: [], econ: b, housesPx: [] };
  a.name = vA.name; b.name = vB.name;
  const players = new Map(), npcs = new Map();
  let post = null;
  Object.assign(S, { zoneId: ZONE, world: w, ready: true, dayMs: M, lastGameDay: G0, epoch: E0, tickJobs: null, villages: [vA, vB], byDbId: new Map([[1, vA], [2, vB]]),
    byEcon: new Map([[a, vA], [b, vB]]), econ: E1, econV2: E2, caravanBodies: new Map(), bodyExits: new Map(),
    deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {}, xzonePost: (zone, payload) => post(zone, payload) } });
  const seam = { x: 4000, y: 700 }, peerPt = { x: 0, y: 700 };
  const freshX = () => ({ st: { sent: 0, sentOk: 0, sentFail: 0, bounced: 0, retried: 0, dup: 0, bodyOut: 0, crossArrive: 0, crossReturn: 0, deposited: 0, lost: 0 }, track: new Map(), trace: [], retry: [], seen: new Set(), seenQ: [],
    host: { peers: [PEER], pushSnaps: () => {} },
    core: { G: new Map([[PEER, {}]]), infoR: 5000, pend: [], X: { stubs: [], out: [], inbox: [] }, dayOut: () => ({ recs: [], snaps: [] }),
      distNames: (local, peer, pn) => (pn === 'FAR' ? 99999 : 1200),
      splitNames: (local, peer, pn) => ({ ptLocal: { x: seam.x, y: seam.y }, ptPeer: { x: peerPt.x, y: peerPt.y }, ptsLocal: [{ x: 400, y: 700 }, { x: seam.x, y: seam.y }] }),
      onRecord: function (m) { this.pend.push({ gday: m.gday, rec: m.rec, seq: this.pend.length }); return true; } } });
  S.xzone = freshX();
  const pop = () => a.npcs.length + b.npcs.length;
  const snap = () => ({ pop: pop(), popA: a.npcs.length, popB: b.npcs.length, rows: P.rows().map((r) => ({ key: r.key, ph: r.ph, unsure: !!r.unsure, id: r.npc && r.npc.id, from: r.npc && r.npc._t1324From })), stat: Object.assign({}, P.stat()) });
  const heard = (o) => { a._t1324Heard = { [PEER + '|' + (o.name || 'X마을')]: Object.assign({ zone: PEER, name: o.name || 'X마을', d: D0 - 1, at: D0 - 1, fe: 1e5, n: 10, h: 0.9, beds: 100 }, o) }; };
  //   부모가 주는 답(약속을 쥐었다가 부모 말에 따라 푼다)
  let pendRes = null;
  post = (zone, payload) => new Promise((res, rej) => { pendRes = { res, rej }; process.send({ t: 'post', zone, payload }); });
  const flush = () => new Promise((r) => setImmediate(r));
  process.on('message', async (m) => {
    try {
      if (m.t === 'answer') { const q = pendRes; pendRes = null; if (q) { if (m.err) q.rej(new Error(m.err)); else q.res(m.res); } await flush(); await flush(); process.send({ t: 'ok', snap: snap() }); return; }
      if (m.t === 'heard') { heard(m.o || {}); process.send({ t: 'ok' }); return; }
      if (m.t === 'pick') { const d = mute(() => P.pick(vA)); process.send({ t: 'ok', pick: d ? (d._t1324 ? { foreign: true, zone: d.zone, name: d.name } : { local: d.name }) : null }); return; }
      if (m.t === 'depart') { const d = mute(() => P.pick(vA)); let ok = false; if (d && d._t1324) ok = mute(() => P.depart(vA, a.npcs[a.npcs.length - 1], d, w.day)); process.send({ t: 'ok', ok, snap: snap() }); return; }
      if (m.t === 'day') { for (let i = 0; i < (m.n || 1); i++) { w.day++; CLK += M; S.lastGameDay++; mute(() => P.day()); await flush(); } process.send({ t: 'ok', snap: snap(), posted: !!pendRes }); return; }
      if (m.t === 'recv') { const r = mute(() => V.xzoneReceive(m.payload)); process.send({ t: 'ok', res: r, snap: snap() }); return; }
      if (m.t === 'empty') { b.npcs.length = 0; a.npcs.length = 0; process.send({ t: 'ok' }); return; }
      if (m.t === 'empty1') { a.npcs.length = 0; process.send({ t: 'ok', snap: snap() }); return; }   // 그 존 1번 마을만 빔(⑩)
      if (m.t === 'restart') {   // 메타 곁 칸 → 새 판(메모리 0) → 되돌림
        const packed = P.pack(); const keep = { seen: [...S.xzone.seen], seenQ: S.xzone.seenQ.slice() };
        S._t1324W = []; S.xzone = freshX(); for (const k of keep.seenQ) { S.xzone.seen.add(k); S.xzone.seenQ.push(k); }   // 받은 열쇠는 T1321 메타 곁 칸이 되돌린다(같은 판)
        S._t1324Saved = packed ? JSON.parse(JSON.stringify(packed)) : null; pendRes = null;
        mute(() => P.restore());
        process.send({ t: 'ok', packed: packed ? packed.length : 0, snap: snap() }); return;
      }
      if (m.t === 'snap') { process.send({ t: 'ok', snap: snap() }); return; }
      if (m.t === 'news') { const r = { kind: 'return', id: 5, lastTo: vA.name }; mute(() => P.news(r)); process.send({ t: 'ok', t1324: r.t1324 || null, fe: +E1.totalFoodEquivalent(a).toFixed(3), n: a.npcs.length }); return; }
      if (m.t === 'hear') {   // 집 존 — 그 캐러밴('xzone' 칸)의 'return' 을 받으면 집 마을이 듣는다(쓸 수 있는 날 = 오늘 + 남은 날)
        w.caravans.push({ id: 77, from: a, to: { name: 'B마을1', zone: PEER, _xz: true }, state: 'xzone', departDay: D0 - 2 });
        const res = mute(() => V.xzoneReceive({ kind: 'caravan', zone: PEER, gday: S.lastGameDay, rec: { kind: 'return', id: 77, toZone: ZONE, returningRes: 'food', returningAmt: 1, remain: 3, lastTo: 'B마을1',
          t1324: { name: 'B마을1', d: w.day - 1, fe: 1e5, n: 10, h: 0.9, beds: 100 } } }));
        process.send({ t: 'ok', res, heard: a._t1324Heard || null, day: w.day }); return;
      }
    } catch (e) { process.send({ t: 'err', err: String(e && e.stack || e) }); }
  });
  process.send({ t: 'ready', on: P.on(), snap: snap() });
  return;
}

// ── 부모 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const J = (o) => JSON.stringify(o);
function kid(zone, baits, env) {
  const E = Object.assign({}, process.env, { T525_CROSS_ZONE: '1', T1324_XZ_MIGRATE: '1' }, env || {});
  const c = fork(__filename, ['--child', zone, baits || '-'], { env: E, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  const q = []; let waiter = null, posted = null;
  c.on('exit', (code) => { const m = { t: 'err', err: 'exit ' + code }; if (waiter && !waiter.post) { const w = waiter; waiter = null; w.res(m); } else q.push(m); });
  c.on('message', (m) => { if (m.t === 'post') { posted = m; if (waiter && waiter.post) { const w = waiter; waiter = null; w.res(m); } return; } if (waiter && !waiter.post) { const w = waiter; waiter = null; w.res(m); } else q.push(m); });
  const next = () => new Promise((res) => { if (q.length) res(q.shift()); else waiter = { res }; });
  return {
    c, ask: async (m) => { c.send(m); const r = await next(); if (r.t === 'err') throw new Error(zone + ': ' + r.err); return r; },
    ready: async () => { const r = await next(); if (r.t === 'err') throw new Error(zone + ': ' + r.err); return r; }, takePost: () => { const p = posted; posted = null; return p; }, kill: () => { try { c.kill('SIGKILL'); } catch (e) {} },
  };
}
const sum = (a, b) => a.snap.pop + b.snap.pop + a.snap.rows.length + b.snap.rows.length;
async function world(baitsA, baitsB, env) {
  const A = kid('hanbando', baitsA, env), B = kid('nippon', baitsB, env);
  const ra = await A.ready(), rb = await B.ready();
  if (ra.t === 'err' || rb.t === 'err') throw new Error((ra.err || '') + (rb.err || ''));
  return { A, B, on: ra.on && rb.on, base: ra.snap.pop + rb.snap.pop };
}
//   한 사람 한 판: 떠남 → (경계까지 날) → 글이 나오면 쥔다
async function departAndWalk(Z) {
  await Z.A.ask({ t: 'heard', o: { name: 'B마을1' } });
  const d = await Z.A.ask({ t: 'depart' });
  let posted = null;
  for (let i = 0; i < 40 && !posted; i++) { const r = await Z.A.ask({ t: 'day', n: 1 }); posted = Z.A.takePost(); if (r.snap && r.snap.rows.length === 0) break; }
  return { d, posted };
}
async function deliver(Z, posted, how) {   // how: 'ok' | 'lose' | 'refuse' | 'connrefused'
  if (how === 'connrefused') return Z.A.ask({ t: 'answer', err: 'connect ECONNREFUSED 10.0.0.2:3021' });
  const rb = await Z.B.ask({ t: 'recv', payload: posted.payload });
  if (how === 'lose') return { b: rb, a: await Z.A.ask({ t: 'answer', err: 'The operation was aborted due to timeout' }) };
  return { b: rb, a: await Z.A.ask({ t: 'answer', res: rb.res }) };
}
async function walkB(Z, n) { let r = null; for (let i = 0; i < (n || 40); i++) { r = await Z.B.ask({ t: 'day', n: 1 }); if (!r.snap.rows.length) break; } return r; }
async function walkA(Z, n) { let r = null; for (let i = 0; i < (n || 40); i++) { r = await Z.A.ask({ t: 'day', n: 1 }); if (!r.snap.rows.length) break; } return r; }

(async () => {
  console.log('\n=== T1324 — 주민이 존을 넘어 이주한다(손잡이 `T1324_XZ_MIGRATE`) ===');
  const VSRC = fs.readFileSync(VFILE, 'utf8');
  ok(Object.values(BAITS).every(([x]) => VSRC.split(x).length === 2), '⓪ 미끼 자리 넷이 소스에 꼭 한 번씩');
  // ① 고르기
  { const Z = await world();
    ok(Z.on, '①0 [전제] 켬(팔 안 · `T1324_XZ_MIGRATE=1`) — 두 아이 다 문이 선다');
    const p0 = await Z.A.ask({ t: 'pick' });
    await Z.A.ask({ t: 'heard', o: { name: 'B마을1', at: 103 } }); const p1 = await Z.A.ask({ t: 'pick' });
    await Z.A.ask({ t: 'heard', o: { name: 'FAR' } }); const p2 = await Z.A.ask({ t: 'pick' });
    await Z.A.ask({ t: 'heard', o: { name: 'B마을1', h: 0.1 } }); const p3 = await Z.A.ask({ t: 'pick' });
    await Z.A.ask({ t: 'heard', o: { name: 'B마을1', fe: 5 } }); const p4 = await Z.A.ask({ t: 'pick' });
    await Z.A.ask({ t: 'heard', o: { name: 'B마을1' } }); const p5 = await Z.A.ask({ t: 'pick' });
    ok(!(p0.pick && p0.pick.foreign), '★①1 들은 적 없는 이웃 존 마을은 안 고른다(모르는 곳 0 — 제 존 마을이나 아무 데도)', J(p0.pick));
    ok(!(p1.pick && p1.pick.foreign), '①2 소식이 아직 길 위(상인이 집에 닿기 전)면 안 고른다', J(p1.pick));
    ok(!(p2.pick && p2.pick.foreign), '①3 정보 반경 밖 쌍은 안 고른다', J(p2.pick));
    ok(!(p3.pick && p3.pick.foreign) && !(p4.pick && p4.pick.foreign), '①4 들은 행복이 낮거나 들은 곳간이 얇으면 안 고른다', J([p3.pick, p4.pick]));
    ok(!!(p5.pick && p5.pick.foreign && p5.pick.name === 'B마을1'), '★①5 들은 줄이 더 행복 · 곳간 · 침상이면 이웃 존 마을을 고른다', J(p5.pick));
    Z.A.kill(); Z.B.kill(); }
  // ⑧ 안다 — 캐러밴이 들고 오는 줄(보내는 쪽 'return' 에 싣기 · 받는 쪽 집 마을이 듣기)
  { const Z = await world();
    const nw = await Z.A.ask({ t: 'news' });
    ok(!!(nw.t1324 && nw.t1324.name && nw.t1324.n === nw.n && Math.abs(nw.t1324.fe - nw.fe) < 1e-6 && 'h' in nw.t1324 && 'beds' in nw.t1324), '⑧1 이웃 존이 \'return\' 을 밀 때 그 캐러밴이 치른 마을의 그날 줄(곳간 · 사람 · 행복 · 침상)을 싣는다', J(nw.t1324));
    const hr = await Z.A.ask({ t: 'hear' }), row = hr.heard && hr.heard['nippon|B마을1'];
    ok(!!(hr.res && hr.res.ok && row && row.zone === 'nippon' && row.at === hr.day + 3), '★⑧2 집 존이 받으면 그 캐러밴 집 마을이 듣는다 — 쓸 수 있는 날 = 오늘 + 남은 날(상인이 집에 닿는 날)', J({ res: hr.res, row }));
    Z.A.kill(); Z.B.kill(); }
  // ② 한 번 넘김
  { const Z = await world();
    const { d, posted } = await departAndWalk(Z);
    ok(d.ok && d.snap.popA === d.snap.pop - d.snap.popB && d.snap.rows.length === 1 && d.snap.rows[0].ph === 'out', '②1 떠남 — A 명부 −1 · 길 위 줄 1(경계 칸으로)', J(d.snap.rows));
    ok(!!(posted && posted.payload && posted.payload.rec && posted.payload.rec.kind === 'migrant' && posted.payload.kind === 'caravan'), '②2 경계 칸에 닿은 날 캐러밴 문으로 민다(기록 `migrant`)', posted ? J({ kind: posted.payload.kind, rec: posted.payload.rec.kind, to: posted.payload.rec.to }) : '글 없음');
    const r = await deliver(Z, posted, 'ok');
    ok(r.b.res.ok && r.b.snap.rows.length === 1 && r.b.snap.rows[0].ph === 'in', '②3 B 받음 — 길 위 줄 1(받는 마을로)', J(r.b.res));
    ok(r.a.snap.rows.length === 0, '②4 A 답 OK → 줄 0', J(r.a.snap.rows));
    const e = await walkB(Z);
    const s = sum(r.a, e);
    ok(e.snap.rows.length === 0 && e.snap.pop === r.b.snap.pop + 1, '★②5 B 닿음 — B 명부 +1 · 줄 0', J({ popB0: r.b.snap.pop, popB: e.snap.pop }));
    ok(e.snap.stat.arrive === 1 && e.snap.stat.in === 1, '②5b 받는 존 셈 — 받음 1 · 닿음 1', J({ in: e.snap.stat.in, arrive: e.snap.stat.arrive }));
    const fin = await Z.B.ask({ t: 'snap' });
    ok(s === Z.base, '★②6 두 존 사람 합(명부 + 길 위 줄) = 처음 수', `${s} = ${Z.base}`);
    Z.A.kill(); Z.B.kill(); }
  // ③ 답 잃음 → dup
  const dupCase = async (bB) => { const Z = await world('-', bB); const { posted } = await departAndWalk(Z);
    const r1 = await deliver(Z, posted, 'lose');
    const mid = r1.a.snap;
    let p2 = null; for (let i = 0; i < 3 && !p2; i++) { await Z.A.ask({ t: 'day', n: 1 }); p2 = Z.A.takePost(); }
    const r2 = p2 ? await deliver(Z, p2, 'ok') : null;
    const e = await walkB(Z);
    const out = { mid, resent: !!p2, dup: r2 ? !!r2.b.res.dup : null, aRows: r2 ? r2.a.snap.rows.length : null, bRows: r2 ? r2.b.snap.rows.length : null, popB: e.snap.pop, sum: r2 ? r2.a.snap.pop + e.snap.pop + r2.a.snap.rows.length + e.snap.rows.length : null, base: Z.base };
    Z.A.kill(); Z.B.kill(); return out; };
  { const o = await dupCase();
    ok(o.mid.rows.length === 1 && o.mid.rows[0].unsure, '③1 답 잃음 — A 숨긴 채(모름) · 줄 1', J(o.mid.rows));
    ok(o.resent && o.dup === true && o.aRows === 0 && o.bRows === 1, '★③2 다음 하루 같은 열쇠 → B `dup` · A 줄 0 · B 줄 하나(둘 0)', J(o));
    ok(o.sum === o.base, '★③3 두 존 사람 합 = 처음 수', `${o.sum} = ${o.base}`); }
  // ④ 거절 → 집으로
  const refuseCase = async (bA) => { const Z = await world(bA); const { posted } = await departAndWalk(Z);
    await Z.B.ask({ t: 'empty' });   // 받는 마을이 비었다 — 받는 존이 "안 받는다"(no-village)
    const rb = await Z.B.ask({ t: 'recv', payload: posted.payload }); const ra = await Z.A.ask({ t: 'answer', res: rb.res });
    const e = await walkA(Z);
    const out = { res: rb.res, back: ra.snap.rows.map((r) => r.ph), popA0: ra.snap.popA, popA: e.snap.popA, rows: e.snap.rows.length, stat: { refused: e.snap.stat.refused, home: e.snap.stat.home } };
    Z.A.kill(); Z.B.kill(); return out; };
  { const o = await refuseCase();
    ok(o.res && o.res.ok === false && o.back[0] === 'back', '④1 B 거절(마을 빔) → A 집으로 되돌아 걷는다', J(o));
    ok(o.rows === 0 && o.popA === o.popA0 + 1 && o.stat.home === 1, '★④2 집에 닿으면 A 명부 +1(사라짐 0)', J(o)); }
  // ⑤ 연결 안 섬 · 모름 규칙
  { const Z = await world(); const { posted } = await departAndWalk(Z);
    const r1 = await deliver(Z, posted, 'connrefused');
    ok(r1.snap.rows[0] && r1.snap.rows[0].ph === 'back', '⑤1 첫 글 연결 안 섬(안 닿은 것이 확실) → 집으로', J(r1.snap.rows));
    Z.A.kill(); Z.B.kill(); }
  { const Z = await world(); const { posted } = await departAndWalk(Z);
    await deliver(Z, posted, 'lose');
    let p2 = null; for (let i = 0; i < 3 && !p2; i++) { await Z.A.ask({ t: 'day', n: 1 }); p2 = Z.A.takePost(); }
    const r2 = p2 ? await Z.A.ask({ t: 'answer', err: 'connect ECONNREFUSED 10.0.0.2:3021' }) : null;
    ok(!!(r2 && r2.snap.rows[0] && r2.snap.rows[0].ph === 'out' && r2.snap.rows[0].unsure), '★⑤2 모름 규칙 — 앞 글이 모른 채면 다시 민 글 연결 안 섬에도 숨긴 채(되돌리지 않는다 · 앞 글이 닿았으면 둘)', r2 ? J(r2.snap.rows) : '글 없음');
    Z.A.kill(); Z.B.kill(); }
  // ⑥ 보내는 존 재기동 — 답 잃은 뒤 다시 뜸 → 다시 밂 → dup
  { const Z = await world(); const { posted } = await departAndWalk(Z);
    await deliver(Z, posted, 'lose');
    const rs = await Z.A.ask({ t: 'restart' });
    let p2 = null; for (let i = 0; i < 3 && !p2; i++) { await Z.A.ask({ t: 'day', n: 1 }); p2 = Z.A.takePost(); }
    const r2 = p2 ? await deliver(Z, p2, 'ok') : null;
    const e = await walkB(Z);
    ok(rs.packed === 1 && rs.snap.rows.length === 1 && rs.snap.rows[0].unsure, '⑥1 메타 곁 칸에 길 위 줄(모름) · 다시 뜬 판이 되돌림', J(rs.snap.rows));
    ok(!!(r2 && r2.b.res.dup && r2.a.snap.rows.length === 0 && e.snap.pop === r2.b.snap.pop + 1), '★⑥2 다시 밂 → B `dup` · A 줄 0 · B 사람 하나(둘 0)', r2 ? J({ dup: r2.b.res.dup, aRows: r2.a.snap.rows.length, popB0: r2.b.snap.pop, popB: e.snap.pop }) : '글 없음');
    ok(!!r2 && r2.a.snap.pop + e.snap.pop + r2.a.snap.rows.length + e.snap.rows.length === Z.base, '⑥3 두 존 사람 합 = 처음 수', r2 ? `${r2.a.snap.pop + e.snap.pop} = ${Z.base}` : '');
    Z.A.kill(); Z.B.kill(); }
  // ⑦ 받는 존 재기동 — 받은 뒤(줄 'in') 다시 뜸 → 되돌림 → 닿음
  { const Z = await world(); const { posted } = await departAndWalk(Z);
    const r = await deliver(Z, posted, 'ok');
    const rs = await Z.B.ask({ t: 'restart' });
    const e = await walkB(Z);
    ok(rs.packed === 1 && e.snap.rows.length === 0 && e.snap.pop === r.b.snap.pop + 1, '★⑦ 받는 존 재기동 — 길 위 줄(받는 마을로)이 되돌아와 닿는다(사라짐 0 · 둘 0)', J({ packed: rs.packed, popB0: r.b.snap.pop, popB: e.snap.pop }));
    Z.A.kill(); Z.B.kill(); }
  // ⑩ 가던 마을이 걷는 사이 빔 — T1080 그 다시 고르기(받는 존 안 · 집 존 안)
  { const Z = await world(); const { posted } = await departAndWalk(Z);
    await deliver(Z, posted, 'ok');
    const em = await Z.B.ask({ t: 'empty1' });   // 받는 마을(B마을1)이 빔
    const e = await walkB(Z);
    ok(e.snap.rows.length === 0 && e.snap.stat.reroute === 1 && e.snap.stat.arrive === 1 && e.snap.popB === em.snap.popB + 1, '★⑩1 받는 마을이 걷는 사이 빔 → 받는 존 안 다음 산 마을로 다시 골라 닿는다(T1080 그 문 · 사라짐 0)', J({ reroute: e.snap.stat.reroute, popB0: em.snap.popB, popB: e.snap.popB, rows: e.snap.rows }));
    Z.A.kill(); Z.B.kill(); }
  { const Z = await world(); const { posted } = await departAndWalk(Z);
    await Z.B.ask({ t: 'empty' });
    const rb = await Z.B.ask({ t: 'recv', payload: posted.payload }); const ra = await Z.A.ask({ t: 'answer', res: rb.res });
    const em = await Z.A.ask({ t: 'empty1' });   // 집(A마을1)이 빔
    const e = await walkA(Z);
    ok(!!(ra.snap.rows[0] && ra.snap.rows[0].ph === 'back') && e.snap.rows.length === 0 && e.snap.stat.reroute === 1 && e.snap.stat.home === 1 && e.snap.popB === em.snap.popB + 1, '★⑩2 되돌아 걷는 사이 집이 빔 → 집 존 안 다음 산 마을로(사라짐 0)', J({ back: ra.snap.rows.map((r) => r.ph), reroute: e.snap.stat.reroute, home: e.snap.stat.home, popA2_0: em.snap.popB, popA2: e.snap.popB }));
    Z.A.kill(); Z.B.kill(); }
  // ⑨ 끔(증인 · 손잡이 없음) — 들은 줄이 있어도 이웃 존을 안 고르고 받는 문은 'migrant' 를 모른다(종전 글자)
  { const Z = await world('-', '-', { T1324_XZ_MIGRATE: '' });
    await Z.A.ask({ t: 'heard', o: { name: 'B마을1' } }); const pk = await Z.A.ask({ t: 'pick' });
    const rb = await Z.B.ask({ t: 'recv', payload: { kind: 'caravan', zone: 'hanbando', gday: 4800, rec: { kind: 'migrant', id: 'hanbando:x:1', toZone: 'nippon', to: 'B마을1', from: 'A마을1', npc: { id: 'n1.1', age: 20, currentJob: 'farmer' } } } });
    ok(!Z.on && !(pk.pick && pk.pick.foreign) && rb.res && rb.res.ok === false && rb.res.why === 'bad-rec' && rb.snap.rows.length === 0, '⑨ 끔 증인 — 문이 안 선다 · 이웃 존을 안 고른다 · 받는 문은 \'migrant\' 를 모른다(bad-rec · 종전 글자)', J({ on: Z.on, pick: pk.pick, res: rb.res }));
    Z.A.kill(); Z.B.kill(); }
  // 미끼
  { let o = null; try { o = await refuseCase('early'); } catch (e) { o = { err: String(e.message || e) }; }
    ok(!!o && !o.err && o.popA === o.popA0 && o.rows === 0, '미끼 ㉠ 답 전에 줄을 지우는 사본 → ④ 빨강(거절된 사람이 집에 못 닿음 — 사라짐)', J(o)); }
  { let o = null; try { const Z = await world('-', 'noreroute'); const { posted } = await departAndWalk(Z); await deliver(Z, posted, 'ok'); const em = await Z.B.ask({ t: 'empty1' }); const e = await walkB(Z);
      o = { reroute: e.snap.stat.reroute, popB0: em.snap.popB, popB: e.snap.popB, popA: e.snap.popA }; Z.A.kill(); Z.B.kill(); } catch (e) { o = { err: String(e.message || e) }; }
    ok(!!o && !o.err && !(o.reroute === 1 && o.popB === o.popB0 + 1), '미끼 ㉢ 다시 고르기를 뺀 사본 → ⑩1 빨강(빈 마을에 붙는다)', J(o)); }
  { let o = null; try { o = await dupCase('twice,twice2'); } catch (e) { o = { err: String(e.message || e) }; }
    ok(!!o && !o.err && (o.bRows === 2 || o.sum > o.base), '미끼 ㉡ 받는 존이 같은 사람을 두 번 받는 사본 → ③ 빨강(둘)', J(o)); }
  console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('하네스 실패:', e); process.exit(1); });
