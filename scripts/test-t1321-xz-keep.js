#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1321-xz-keep.js — 답을 기다리는 캐러밴 넘김이 보내는 존 재기동을 건넌다 (T1321 · T1292 회부 5 · 손잡이 `T1321_XZ_KEEP` — ★T1324 켬 기본 · '0' 끔) ==
//
// ★왜: 숨긴 채 답을 기다리는 넘김(T1292)은 다시 밂 줄(`X.retry`) · 숨김 · 받은 열쇠 · 받은 기록 줄이 메모리라 보내는 존이 다시 뜨면 사라졌다 —
//   받는 존이 받았으면 저쪽에만 · 안 받았으면 어디에도(집 존 캐러밴은 'xzone' 칸에 영영 — 상인 · 짐 사라짐). 그리고 앞 글이 답을 못 들은 기록을
//   다시 민 글이 연결 실패(받는 존이 꺼짐)를 맞으면 종전은 되돌렸다(앞 글이 닿았으면 짐이 둘).
// 판(운영 함수 그대로 — T1292 하네스와 같은 꼴: `_caravanBodyProbe` 의 `xzMakeBody` · `sendXz` · `afterSendXz` + `__t1321Probe` 의 `pack` · `restore`):
//   ① 모름 규칙 — 답 없음(시한) → 다시 민 글 연결 안 섬(ECONNREFUSED): 켬 = 숨긴 채 · 다시 밂 줄 1 · 되돌림 0 · 끔(T1292 만) = 드러내고 되돌림(앞 글이 닿았으면 둘 — 증인)
//   ② 재기동 — 답 없음 뒤 메타 곁 칸(`pack`)에 나간 줄(모름)이 실리고 · 다시 뜬 판(새 호스트 · `restore`)이 다시 밂 줄에 세운다 → 다음 경계에 같은 기록을 다시 밀어
//      `dup` OK → 줄 0 · 캐러밴 'xzone' 그대로(저쪽이 갖는다) · 되돌림 0(둘 0) — 끔 = 메타 칸 없음 · 줄 0 = 그 기록은 영영 안 민다(사라짐 — 증인)
//   ③ 재기동 뒤 받는 존이 아직 꺼짐(ECONNREFUSED) → 숨긴 채 · 다음 경계 OK → 받음(사라짐 0)
//   ④ 받은 쪽 몫 — 받은 열쇠 · 받은 기록 줄이 메타 곁 칸에 실리고 다시 뜬 판이 되돌린다(같은 기록을 다시 받으면 `dup`)
//   ⑤ 표(셈 칸 · 메모리) — 다시 뜬 판에서 다시 밀기 전에 받는 존이 치러 돌려보낸 'return' 이 먼저 닿는다(판 R3 — 잃음 9 로 셌다 · 짐은 곳간에 들었다):
//      켬 = 받는 순간 표 칸 · 귀환 짐이 붙고 다시 민 답(dup OK)이 안 덮는다 → econ 이 끝내면 입금 1 · 잃음 0
//   미끼(아이 안 · 파일 무변): 되돌리기에서 다시 밂 줄 세우기를 뺀 사본 → ② 빨강(사라짐) · 모름 규칙을 뺀 사본 → ① 켬 빨강(드러냄 · 되돌림) ·
//     받는 순간 표 칸 세우기를 뺀 사본 → ⑤ 빨강(잃음 1)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  norestore: ['    X.retry.push({ r: q.r, tries: Math.max(1, q.tries | 0) });   // 다음 경계에 같은 기록을 다시 민다', '    // 미끼 — 다시 밂 줄에 안 세운다'],
  nounsure: ['  if (T1321_XZ_KEEP && !answered && _t1321Conn(why) && _t1321Unsure(key)) {', '  if (false) {'],
  notrack: ['const t = X.track.get(r.id) || _t1321Track(r);', 'const t = X.track.get(r.id);'],
};

if (process.argv[2] === '--child') {
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  if (bait) {
    const old = Module._extensions['.js'];
    Module._extensions['.js'] = function (m, f) {
      if (f !== VFILE) return old(m, f);
      const src = fs.readFileSync(f, 'utf8');
      if (src.split(bait[0]).length !== 2) { process.stdout.write('@@' + JSON.stringify({ err: '미끼 자리가 한 번이 아니다' }) + '\n'); process.exit(3); }
      m._compile(src.replace(bait[0], bait[1]), f);
    };
  }
  const mute = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };
  const V = require(VFILE), E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2')), ZC = require(path.join(ROOT, 'server', 'zone-config'));
  const P = V.__labProbe._caravanBodyProbe, H = V.__p3Bind({}), S = H.state;
  const E0 = 1.6e12, M = 240000, G0 = 4800, D0 = 100;
  let CLK = E0 + (G0 + 0.3) * M; Date.now = () => CLK;
  const w = mute(() => E2.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational', infoRange: 5000, raidPer100: 0 }));
  const [a, b] = w.villages; w.day = D0; w.caravans = [];
  const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [], econ: a }, vB = { dbId: 2, name: '나', ccx: 40, ccy: 22, npcPids: [], econ: b };
  let nid = 0, post = null;
  const players = new Map(), npcs = new Map();
  Object.assign(S, { zoneId: 'hanbando', world: w, ready: true, dayMs: M, lastGameDay: G0, epoch: E0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null, villages: [vA, vB],
    byEcon: new Map([[a, vA], [b, vB]]), econV2: E2, _t1034Saved: null, _t775: null, caravanBodies: new Map(), _carTickAt: undefined,
    deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {},
      spawnNpc: (o) => { const p = { pid: 'n' + (++nid), x: o.x, y: o.y, hp: 100, hunger: 100, thirst: 100, name: o.name, handingOff: false }; players.set(p.pid, p); npcs.set(p.pid, p); return p; },
      xzonePost: (zone, payload) => post(zone, payload) } });
  const stub = { name: '저쪽마을', zone: 'nippon', _xz: true };
  const flush = () => new Promise((r) => setImmediate(r));
  const freshX = () => ({ st: { sent: 0, sentOk: 0, sentFail: 0, bounced: 0, retried: 0, dup: 0, bodyOut: 0, crossArrive: 0, crossReturn: 0, walkWait: 0, walkWaitLate: 0, soldOk: 0, deposited: 0, lost: 0 }, track: new Map(), trace: [], retry: [], seen: new Set(), seenQ: [],
    core: { splitNames: () => null, pend: [], X: { stubs: [], out: [], inbox: [] }, onRecord: function (m) { this.pend.push({ gday: m.gday, rec: m.rec, seq: this.pend.length }); return true; } } });
  const out = { keep: process.env.T1321_XZ_KEEP !== '0', cases: {} };   // ★[T1324] 켬 기본 — '0' 만 끔
  const ZA = ZC.ZONES.hanbando, ZB = ZC.ZONES.nippon;
  const tgt = { x: Math.min(Math.max(0 + ZB.worldOffsetX - ZA.worldOffsetX, 0), ZA.zoneWidth - 1), y: 700 };
  const mkCar = (id) => {
    const c = { id, from: a, to: stub, trader: a.npcs[0], state: 'xzone', departDay: D0 - 1, arriveDay: D0 + 1, returnArriveDay: D0 + 3, escort: 1, giveRes: 'wood', giveAmt: 5, travelDays: 2,
      _xzCross: { day: D0, ptLocal: null, ptPeer: { x: 0, y: 700 } }, _xzFHome: 0.5 };
    w.caravans.push(c);
    const bd = mute(() => P.xzMakeBody(id, c, [{ x: tgt.x - 600, y: tgt.y }, { x: tgt.x, y: tgt.y }], 'outbound', Date.now(), E0 + (G0 + 1) * M, stub, { tribeId: 'simvil_1', tribeName: '가', simVid: 1 }));
    bd.prog = bd.len;
    for (const pid of [bd.pid].concat((bd.escorts || []).map((e) => e.pid))) { const q = players.get(pid); if (q) { q.x = tgt.x; q.y = tgt.y; } }
    const r = { kind: 'arrive', id, toZone: 'nippon', to: '저쪽마을', ptPeer: { x: 0, y: 700 }, ptHome: { x: tgt.x, y: tgt.y }, giveRes: 'wood', giveAmt: 5, remain: 1, home: { name: '가', zone: 'hanbando' } };
    return { c, bd, r };
  };
  const answerWith = (ans) => { post = () => (ans.ok != null ? Promise.resolve(ans) : Promise.reject(Object.assign(new Error(ans.err), ans.status ? { status: ans.status } : {}))); };
  const boundary = async (ans) => { CLK += M; S.lastGameDay++; const R = S.xzone.retry.splice(0); answerWith(ans); for (const q of R) { S.xzone.st.retried++; mute(() => P.sendXz(q.r, S.lastGameDay, q.tries)); } await flush(); await flush(); };
  const snap = (X, c, bd) => ({ retry: X.retry.length, pend: X.t1321P ? [...X.t1321P.values()].map((q) => ({ id: q.r.id, tries: q.tries, unsure: q.unsure })) : null, st: Object.assign({}, X.st), trace: X.trace.map((t) => t.k), cState: c.state, cDone: !!c._done,
    hidden: !!(bd && bd._xzHidden), inMap: S.caravanBodies.has(c.id) });
  const TO = { err: 'The operation was aborted due to timeout' }, REF = { err: 'connect ECONNREFUSED 10.0.0.2:3021' };
  (async () => {
    // ① 모름 규칙
    { S.xzone = freshX(); S.caravanBodies = new Map(); w.caravans = [];
      const { c, bd, r } = mkCar(701);
      answerWith(TO); mute(() => P.sendXz(r, G0, 0, true)); await flush(); await flush();
      const s1 = snap(S.xzone, c, bd);
      await boundary(REF);
      out.cases.unsure = { s1, s2: snap(S.xzone, c, bd) }; }
    // ② 재기동 — 답 없음 → 메타 곁 칸 → 새 호스트 → 다시 밂 → dup
    { S.xzone = freshX(); S.caravanBodies = new Map(); w.caravans = [];
      const { c, bd, r } = mkCar(702);
      answerWith(TO); mute(() => P.sendXz(r, G0, 0, true)); await flush(); await flush();
      const before = snap(S.xzone, c, bd);
      const packed = V.__t1321Probe.pack();
      //   다시 뜬 판 — 메모리 0(새 호스트 · 몸 표 비움 · 'xzone' 캐러밴은 메타가 되돌린다 = 같은 장부 칸) · 쥔 곁 칸을 되돌린다
      S.xzone = freshX(); S.caravanBodies = new Map(); S._t1321Saved = packed ? JSON.parse(JSON.stringify(packed)) : null;
      mute(() => V.__t1321Probe.restore(S.xzone));
      const restored = snap(S.xzone, c, null);
      await boundary({ ok: true, dup: true });
      out.cases.restart = { before, packed: packed ? { p: packed.p.length, unsure: packed.p.map((q) => q.unsure) } : null, restored, after: snap(S.xzone, c, null) }; }
    // ③ 재기동 뒤 받는 존 아직 꺼짐 → 숨긴 채 → OK
    { S.xzone = freshX(); S.caravanBodies = new Map(); w.caravans = [];
      const { c, bd, r } = mkCar(703);
      answerWith(TO); mute(() => P.sendXz(r, G0, 0, true)); await flush(); await flush();
      const packed = V.__t1321Probe.pack();
      S.xzone = freshX(); S.caravanBodies = new Map(); S._t1321Saved = packed ? JSON.parse(JSON.stringify(packed)) : null;
      mute(() => V.__t1321Probe.restore(S.xzone));
      await boundary(REF);
      const mid = snap(S.xzone, c, null);
      await boundary({ ok: true });
      out.cases.restartDown = { mid, after: snap(S.xzone, c, null) }; }
    // ④ 받은 쪽 몫 — 받은 열쇠 · 받은 기록 줄
    { S.xzone = freshX(); S.xzone.host = { peers: ['nippon'] }; S.xzone.core.G = new Map([['nippon', {}]]);
      const rec = { kind: 'return', id: 77, fromZone: 'nippon', toZone: 'hanbando', returningRes: 'stone', returningAmt: 2, remain: 1, traderDead: true };
      const a1 = mute(() => V.xzoneReceive({ kind: 'caravan', zone: 'nippon', gday: G0, rec }));
      const packed = V.__t1321Probe.pack();
      S.xzone = freshX(); S.xzone.host = { peers: ['nippon'] }; S.xzone.core.G = new Map([['nippon', {}]]); S._t1321Saved = packed ? JSON.parse(JSON.stringify(packed)) : null;
      mute(() => V.__t1321Probe.restore(S.xzone));
      const a2 = mute(() => V.xzoneReceive({ kind: 'caravan', zone: 'nippon', gday: G0, rec }));
      out.cases.recv = { a1, packed: packed ? { s: packed.s.length, q: packed.q.length } : null, pendAfter: S.xzone.core.pend.length, a2 }; }
    // ⑤ 표 — 다시 뜬 판 · 다시 밀기 전에 'return' 이 먼저 → 다시 밂 dup OK → econ 이 끝냄(`c._done`) → 하루 끝(`_xzDayOut` 그 함수)의 입금 · 잃음 셈
    { S.xzone = freshX(); S.caravanBodies = new Map(); w.caravans = [];
      const { c, r } = mkCar(705);
      answerWith(TO); mute(() => P.sendXz(r, G0, 0, true)); await flush(); await flush();
      const packed = V.__t1321Probe.pack();
      S.xzone = freshX(); S.xzone.host = { peers: ['nippon'], pushSnaps: () => {} }; S.xzone.core.G = new Map([['nippon', {}]]); S.xzone.core.dayOut = () => ({ recs: [], snaps: [] });
      S.caravanBodies = new Map(); S._t1321Saved = packed ? JSON.parse(JSON.stringify(packed)) : null;
      mute(() => V.__t1321Probe.restore(S.xzone));
      const ret = { kind: 'return', id: 705, fromZone: 'nippon', toZone: 'hanbando', returningRes: 'food', returningAmt: 3, remain: 1, traderDead: false };
      const a1 = mute(() => V.xzoneReceive({ kind: 'caravan', zone: 'nippon', gday: G0 + 1, rec: ret }));
      const tb = () => (S.xzone.track.has(705) ? !!S.xzone.track.get(705).back : null);
      const t1 = tb(), retry1 = S.xzone.retry.length;
      await boundary({ ok: true, dup: true });
      const t2 = tb();
      c._done = true; mute(() => V.__t1321Probe.dayOut());
      out.cases.track = { a1, t1, retry1, t2, sentOk: S.xzone.st.sentOk, deposited: S.xzone.st.deposited, lost: S.xzone.st.lost, trace: S.xzone.trace.map((t) => t.k).filter((k) => k === 'home' || k === 'gone') }; }
    process.stdout.write('@@' + JSON.stringify(out) + '\n');
    process.exit(0);
  })().catch((e) => { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack || e) }) + '\n'); process.exit(1); });
  return;
}

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
function child(env, bait) {
  const E = Object.assign({}, process.env, env); for (const k of ['T1321_XZ_KEEP', 'T1292_XZ_HIDE']) if (!(k in env)) delete E[k];
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { encoding: 'utf8', env: E, timeout: 120000, maxBuffer: 1 << 26 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` };
  return JSON.parse(line.slice(2));
}
const VSRC = fs.readFileSync(VFILE, 'utf8');
console.log('\n=== T1321 — 답을 기다리는 캐러밴 넘김이 재기동을 건넌다(손잡이 `T1321_XZ_KEEP`) ===');
ok(Object.values(BAITS).every(([x]) => VSRC.split(x).length === 2), '⓪ 미끼 자리 셋이 소스에 꼭 한 번씩');
const on = child({}), off = child({ T1321_XZ_KEEP: '0' });   // ★[T1324] 켬 = 손잡이 안 줌(기본 켬) · 끔 = '0'
const J = (o) => JSON.stringify(o);
if (on.err) ok(false, '켬 판이 돌았다', on.err);
else {
  const U = on.cases.unsure;
  ok(U.s1.retry === 1 && U.s1.hidden && U.s1.pend && U.s1.pend[0].unsure === true, '①0 [전제] 답 없음 → 숨긴 채 다시 밂 줄 1 · 나간 줄 모름', J(U.s1));
  ok(U.s2.retry === 1 && U.s2.hidden && U.s2.st.bounced === 0 && !U.s2.trace.includes('unhide') && U.s2.cState === 'xzone', '★① 켬 — 다시 민 글 연결 안 섬 → 숨긴 채 · 다시 밂 줄 1 · 되돌림 0(앞 글이 닿았을 수 있다)', J(U.s2));
  const R = on.cases.restart;
  ok(R.packed && R.packed.p === 1 && R.packed.unsure[0] === true, '②1 메타 곁 칸에 나간 줄(모름)이 실린다', J(R.packed));
  ok(R.restored.retry === 1 && R.restored.pend && R.restored.pend[0].unsure === true, '②2 다시 뜬 판 — 다시 밂 줄 1 · 나간 줄(모름) 되돌림', J(R.restored));
  ok(R.after.retry === 0 && R.after.pend && R.after.pend.length === 0 && R.after.st.sentOk === 1 && R.after.st.bounced === 0 && R.after.cState === 'xzone',
    '★②3 다음 경계 다시 밂 → dup OK → 줄 0 · 되돌림 0 · 캐러밴은 저쪽 몫(xzone) — 둘 0 · 사라짐 0', J(R.after));
  const D = on.cases.restartDown;
  ok(D.mid.retry === 1 && D.mid.st.bounced === 0 && D.after.retry === 0 && D.after.st.sentOk === 1 && D.after.st.bounced === 0, '★③ 다시 뜬 뒤 받는 존 꺼짐 → 숨긴 채 · 다음 경계 OK → 받음(사라짐 0 · 되돌림 0)', J({ mid: D.mid.retry, after: D.after.st }));
  const V2 = on.cases.recv;
  ok(V2.a1 && V2.a1.ok && V2.packed && V2.packed.s === 1 && V2.packed.q === 1 && V2.pendAfter === 1 && V2.a2 && V2.a2.dup === true, '④ 받은 쪽 — 받은 열쇠 · 받은 기록 줄이 실리고 되돌아온다(같은 기록을 다시 받으면 dup · 기록 줄 하나)', J(V2));
  const T = on.cases.track;
  ok(T.a1 && T.a1.ok && T.retry1 === 1 && T.t1 === true && T.t2 === true && T.sentOk === 1 && T.deposited === 1 && T.lost === 0 && T.trace.join() === 'home',
    "★⑤ 표 — 다시 밀기 전에 'return' 이 먼저 닿아도 귀환 짐이 표에 붙고 다시 민 답(dup)이 안 덮는다 → econ 이 끝내면 입금 1 · 잃음 0", J(T));
}
if (off.err) ok(false, '끔 판이 돌았다', off.err);
else {
  const U = off.cases.unsure, R = off.cases.restart;
  ok(U.s2.st.bounced === 1 && U.s2.trace.includes('unhide'), '①증인 끔(T1292 만) — 다시 민 글 연결 안 섬에 드러내고 되돌린다(앞 글이 닿았으면 짐 둘)', J(U.s2));
  ok(!R.packed && R.restored.retry === 0 && R.after.st.sent === 0 && R.after.cState === 'xzone', '②증인 끔 — 메타 칸 0 · 다시 뜬 판 다시 밂 줄 0 · 그 기록은 안 민다(캐러밴 xzone 에 묶임 = 사라짐)', J(R.after));
}
const b1 = child({ T1321_XZ_KEEP: '1' }, 'norestore'), b2 = child({ T1321_XZ_KEEP: '1' }, 'nounsure'), b3 = child({ T1321_XZ_KEEP: '1' }, 'notrack');
ok(!b1.err && b1.cases.restart.after.st.sent === 0 && b1.cases.restart.after.retry === 0, '미끼 ㉠ 되돌리기에서 다시 밂 줄을 뺀 사본 → ② 빨강(그 기록을 안 민다 · 사라짐)', b1.err || J(b1.cases.restart.after.st));
ok(!b2.err && b2.cases.unsure.s2.st.bounced === 1, '미끼 ㉡ 모름 규칙을 뺀 사본 → ① 빨강(드러내고 되돌림)', b2.err || J(b2.cases.unsure.s2.st));
ok(!b3.err && b3.cases.track.lost === 1 && b3.cases.track.deposited === 0, "미끼 ㉢ 받는 순간 표 칸 세우기를 뺀 사본 → ⑤ 빨강(다시 민 답이 짐 없는 칸을 세워 잃음 1 — 판 R3 그 셈)", b3.err || J(b3.cases.track));
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
