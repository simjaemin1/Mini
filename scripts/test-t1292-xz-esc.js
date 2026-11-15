#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1292-xz-esc.js — 넘긴 호위 몸 수 = 보내는 순간 산 호위 수 (T1292 · 2026-11-13) =====================================
//
// ★왜(캐논 797 — 모든 NPC 는 언제나 몸이 있다 · 경계에서 사라지거나 둘이 되면 안 된다):
//   존을 넘는 캐러밴의 호위는 받는 존이 **econ 수로 새로 세웠다**(가는 길 `r.escort` = 출발 때 수 · 돌아오는 길 = 집 캐러밴 수 − 저쪽 econ 약탈에 죽은 수).
//   econ 은 호위 **몸**의 죽음을 모른다(전사 수는 econ 몫 · 몸은 아바타) ⇒ 보내는 존 길 위에서 죽은 호위(사람 · 맹수 · hp 0)가 경계 너머에서 다시 살아 섰다.
//   고침(`server/villages.js` `_xzSend` · `_xzReceiveCaravan` · `_xzBodyIn` · 손잡이 `T1292_XZ_ESC` 켬 기본 · `=0` = 종전 글자):
//   보내는 존이 미는 글에 그 순간 산 호위 수(`payload.esc` — 기록 `rec` 은 그대로 · econ 무접촉)를 싣고, 받는 존은 econ 수와 그 수 중 작은 만큼만 세운다.
// 판(판정 사본 0 — 운영 함수 그대로): 보내는 존 = `__labProbe._caravanBodyProbe` 의 `xzMakeBody` · `sendXz`(`deps.xzonePost` 흉내가 글을 받아 둔다) →
//   받는 존 = 모듈 문 `xzoneReceive`(zone.js `/handoff_prepare` 가 `kind: 'caravan'` 글을 통째로 넘기는 그 문). 한 모듈 `state` 를 두 존으로 갈아 끼운다(존마다 몸 표 · 경계 호스트 따로).
// 지키는 것:
//   ⓪ 글자 — 손잡이 한 줄(`!== '0'`) · zone.js 가 글(`data`)을 통째로 넘긴다(실은 수가 받는 존에 닿는다) · 미끼 자리가 소스에 꼭 한 번
//   ① 켬(기본) — A 가는 길 호위 셋 중 하나가 길 위에서 죽었다(hp 0) → 실은 수 2 → 받는 존이 둘을 세운다 · A2 죽은 몸이 사람 표에서 빠진 꼴도 같다 ·
//      B 돌아오는 길 — 이웃 존에서 셋 중 둘이 죽었다 → 집 존이 하나를 세운다 · C econ 약탈로 죽은 호위(`escKilled` 1 · 몸은 셋 다 산)는 종전대로 둘(늘지 않는다) ·
//      D 다 산 넘김(두 존 판의 꼴) → 종전과 같은 셋(무동작) · E 실은 수가 없는 글(몸 없이 민 기록 · 종전 존이 보낸 글) → 종전 econ 수 · 기록 `rec` 에 새 칸 0
//   ② 끔(`T1292_XZ_ESC=0` = 종전 글자) — A · B 셋(죽은 호위가 경계 너머에서 다시 선다) · 글에 실은 수 없음
//   ③ 미끼(아이 안 · 파일 무변) — 받는 존 줄임을 뺀 사본 → ① A · B 빨강 · 보내는 존 싣기를 뺀 사본 → ① A 빨강
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const VFILE = path.join(ROOT, 'server', 'villages.js');
const BAITS = {
  nocut: ['const _t1292Esc = (n, alive) => { if (!T1292_XZ_ESC ||', 'const _t1292Esc = (n, alive) => { if (true ||'],
  nosend: ['if (T1292_XZ_ESC && body) { payload.esc = _t1292EscAlive(body);', 'if (false) { payload.esc = _t1292EscAlive(body);'],
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
  const vA = { dbId: 1, name: '가', ccx: 10, ccy: 10, npcPids: [], econ: a }, vC = { dbId: 2, name: '저쪽마을', ccx: 40, ccy: 22, npcPids: [], econ: b };
  let nid = 0, post = null;
  const players = new Map(), npcs = new Map();
  Object.assign(S, { world: w, ready: true, dayMs: M, lastGameDay: G0, epoch: E0, _t731Anchor: null, _t731: null, tickJobs: null, _t1253Edge: false, roads: null,
    econV2: E2, _t1034Saved: null, _t775: null, _carTickAt: undefined,
    deps: { players, npcs, moveSpeed: 64, isPositionActive: () => true, isBlockedByWall: () => false, setHp: (q, v) => { q.hp = v; return v; }, broadcast: () => {},
      spawnNpc: (o) => { const p = { pid: 'n' + (++nid), x: o.x, y: o.y, hp: 100, hunger: 100, thirst: 100, name: o.name, handingOff: false }; players.set(p.pid, p); npcs.set(p.pid, p); return p; },
      xzonePost: (zone, payload) => post(zone, payload) } });
  const mkX = (peer) => ({ st: { sent: 0, sentOk: 0, sentFail: 0, bounced: 0, retried: 0, dup: 0, bodyOut: 0, bodyIn: 0, bodyInSkip: 0, crossArrive: 0, crossReturn: 0, walkWait: 0, walkWaitLate: 0, soldOk: 0 },
    track: new Map(), trace: [], retry: [], seen: new Set(), seenQ: [], host: { peers: [peer], hs: { geo: null } },
    core: { G: new Map([[peer, {}]]), onRecord: () => {}, splitNames: () => null, st: {}, peersReady: () => [peer], X: { stubs: [] } } });   // `xzonePerf` 가 읽는 칸까지(관측)
  //   존 둘 — 한 모듈 `state` 를 갈아 끼운다(존마다 몸 표 · 경계 호스트 · 마을 표 따로 · 사람 표는 pid 가 겹치지 않아 하나로 둔다)
  const Z = { hanbando: { villages: [vA], byEcon: new Map([[a, vA]]), X: mkX('nippon'), bodies: new Map() },
    nippon: { villages: [vC], byEcon: new Map([[b, vC]]), X: mkX('hanbando'), bodies: new Map() } };
  const as = (z) => Object.assign(S, { zoneId: z, villages: Z[z].villages, byEcon: Z[z].byEcon, xzone: Z[z].X, caravanBodies: Z[z].bodies });
  const ZA = ZC.ZONES.hanbando, ZB = ZC.ZONES.nippon;
  const tgtH = { x: Math.min(Math.max(0 + ZB.worldOffsetX - ZA.worldOffsetX, 0), ZA.zoneWidth - 1), y: Math.min(Math.max(700 + (ZB.worldOffsetY || 0) - (ZA.worldOffsetY || 0), 0), ZA.zoneHeight - 1) };   // 한반도 로컬 경계 칸
  const tgtN = { x: 0, y: 700 };                                                                                                                                                 // 닛폰 로컬 경계 칸
  const alive = (bd) => (bd ? bd.escorts : []).filter((e) => { const p = players.get(e.pid); return p && p.hp > 0; }).length;
  const kill = (bd, n, how) => { for (let i = 0; i < n; i++) { const e = bd.escorts[i]; if (how === 'gone') players.delete(e.pid); else players.get(e.pid).hp = 0; } };
  const place = (bd, t) => { bd.prog = bd.len; for (const pid of [bd.pid].concat(bd.escorts.map((e) => e.pid))) { const q = players.get(pid); if (q && q.hp > 0) { q.x = t.x; q.y = t.y; } } };
  const out = { knob: process.env.T1292_XZ_ESC !== '0', cases: {} };
  let cid = 700;
  //   가는 길 — 집 존(한반도) 캐러밴 몸(호위 `esc`)이 경계 칸에 섰다 · `dead` 만큼 길 위에서 죽었다 → 민다 → 닛폰이 받는다
  function arrive(tag, esc, dead, how, noEsc) {
    const id = ++cid;
    as('hanbando');
    const stub = { name: '저쪽마을', zone: 'nippon', _xz: true };
    const c = { id, from: a, to: stub, trader: a.npcs[0], state: 'xzone', departDay: D0 - 1, arriveDay: D0 + 1, returnArriveDay: D0 + 3, escort: esc, giveRes: 'wood', giveAmt: 5, travelDays: 2,
      _xzCross: { day: D0, ptLocal: null, ptPeer: tgtN }, _xzFHome: 0.5 };
    w.caravans.push(c);
    const bd = mute(() => P.xzMakeBody(id, c, [{ x: tgtH.x - 600, y: tgtH.y }, { x: tgtH.x, y: tgtH.y }], 'outbound', Date.now(), E0 + (G0 + 1) * M, stub, { tribeId: 'simvil_1', tribeName: '가', simVid: 1 }));
    place(bd, tgtH); kill(bd, dead, how);
    const R = { tag, spawned: bd.escorts.length, aliveAtSend: alive(bd) };
    const r = { kind: 'arrive', id, fromZone: 'hanbando', toZone: 'nippon', to: '저쪽마을', ptPeer: tgtN, ptHome: tgtH, giveRes: 'wood', giveAmt: 5, remain: 1, escort: esc, home: { name: '가', zone: 'hanbando' } };
    let cap = null; post = (zone, payload) => { cap = JSON.parse(JSON.stringify(payload)); return new Promise(() => {}); };   // 답은 안 준다(받는 존 쪽만 본다 — 보낸 몸은 숨긴 채)
    mute(() => P.sendXz(r, G0, 0, true));
    if (noEsc && cap) delete cap.esc;                 // 실은 수가 없는 글(종전 존이 보낸 글 · 몸 없이 민 기록과 같은 꼴)
    R.payloadEsc = cap ? (cap.esc === undefined ? null : cap.esc) : 'none'; R.recKeys = cap ? Object.keys(cap.rec).sort().join(',') : null;
    as('nippon');
    R.answer = mute(() => V.xzoneReceive(cap));
    const nb = Z.nippon.bodies.get('xz:hanbando:' + id);
    R.received = nb ? nb.escorts.length : null; R.receivedAlive = alive(nb);
    out.cases[tag] = R; return { id, nb, c };
  }
  //   돌아오는 길 — 이웃 존(닛폰)의 몸(호위 `esc`) · `dead` 만큼 저쪽에서 죽었다 · econ 약탈 죽음 `escKilled` → 민다 → 집 존(한반도)이 받는다
  function back(tag, esc, dead, escKilled) {
    const id = ++cid;
    as('hanbando');
    const stub = { name: '저쪽마을', zone: 'nippon', _xz: true };
    const hc = { id, from: a, to: stub, trader: a.npcs[0], state: 'xzone', departDay: D0 - 3, arriveDay: D0 - 1, returnArriveDay: D0 + 1, escort: esc, giveRes: 'wood', giveAmt: 5, travelDays: 2 };
    w.caravans.push(hc);
    as('nippon');
    const proxy = { id: 'xz:hanbando:' + id, _xzPending: false, giveRes: 'wood', giveAmt: 5, escort: esc, state: 'inbound', from: { name: '가', zone: 'hanbando', _xz: true }, to: b };
    const bd = mute(() => P.xzMakeBody('xz:hanbando:' + id, proxy, [{ x: 600, y: 700 }, tgtN], 'inbound', Date.now(), E0 + (G0 + 1) * M, b, { tribeId: 'xz_hanbando', tribeName: '가' }));
    place(bd, tgtN); kill(bd, dead, 'hp');
    const R = { tag, spawned: bd.escorts.length, aliveAtSend: alive(bd), escKilled };
    const r = { kind: 'return', id, fromZone: 'nippon', toZone: 'hanbando', lastTo: '저쪽마을', ptPeer: tgtH, ptHome: tgtN, returningRes: 'stone', returningAmt: 3, remain: 1, escKilled };
    let cap = null; post = (zone, payload) => { cap = JSON.parse(JSON.stringify(payload)); return new Promise(() => {}); };
    mute(() => P.sendXz(r, G0, 0, true));
    R.payloadEsc = cap ? (cap.esc === undefined ? null : cap.esc) : 'none';
    as('hanbando');
    R.answer = mute(() => V.xzoneReceive(cap));
    const hb = Z.hanbando.bodies.get(id);
    R.received = hb ? hb.escorts.length : null; R.receivedAlive = alive(hb);
    out.cases[tag] = R;
  }
  try {
    arrive('A', 3, 1, 'hp');
    arrive('A2', 3, 1, 'gone');
    back('B', 3, 2, 0);
    back('C', 3, 0, 1);
    arrive('D', 3, 0, 'hp');
    arrive('E', 3, 1, 'hp', true);
    out.stat = V.xzonePerf ? (() => { as('nippon'); const n = V.xzonePerf(); as('hanbando'); const h = V.xzonePerf(); return { n: n && n.t1292, h: h && h.t1292 }; })() : null;
  } catch (e) { process.stdout.write('@@' + JSON.stringify({ err: String(e && e.stack || e) }) + '\n'); process.exit(1); }
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 ───────────────────────────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
function child(env, bait) {
  const E = Object.assign({}, process.env, env); if (!('T1292_XZ_ESC' in env)) delete E.T1292_XZ_ESC;
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { encoding: 'utf8', env: E, timeout: 120000, maxBuffer: 1 << 26 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  if (!line) return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` };
  return JSON.parse(line.slice(2));
}
const txt = (R) => R ? `세운 ${R.spawned} · 보낼 때 산 ${R.aliveAtSend}${R.escKilled ? ` · econ 약탈 죽음 ${R.escKilled}` : ''} · 실은 수 ${R.payloadEsc} → 받는 존이 세운 ${R.received}(답 ${JSON.stringify(R.answer)})` : '-';
const VSRC = fs.readFileSync(VFILE, 'utf8'), VC = require('./code-only.js')(VSRC);
const ZSRC = require('./code-only.js')(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
console.log('\n=== T1292 — 넘긴 호위 몸 수 = 보내는 순간 산 호위 수(손잡이 `T1292_XZ_ESC`) ===');
ok((VC.match(/const T1292_XZ_ESC = process\.env\.T1292_XZ_ESC !== '0';/g) || []).length === 1, "⓪ 손잡이 한 줄 — `!== '0'`(켬 기본 · 되돌림 `=0`)");
ok(/if \(data\.kind === 'caravan' \|\| data\.kind === 'snap'\) out = SimVillages\.xzoneReceive \? SimVillages\.xzoneReceive\(data\) : null;/.test(ZSRC), '⓪ zone.js `/handoff_prepare` 가 글(`data`)을 통째로 `xzoneReceive` 에 넘긴다 — 실은 수가 받는 존에 닿는다');
ok(Object.values(BAITS).every(([x]) => VSRC.split(x).length === 2), '⓪ 미끼 자리 둘이 소스에 꼭 한 번씩');

const on = child({}), off = child({ T1292_XZ_ESC: '0' });
console.log('\n① 켬(기본)');
if (on.err) ok(false, '① 판이 돌았다', on.err);
else {
  const C = on.cases;
  ok(on.knob && Object.values(C).every((R) => R.answer && R.answer.ok === true && R.spawned === 3), '① [전제] 손잡이 켬 · 보내는 몸마다 호위 셋을 세웠다 · 받는 존 답 다 OK');
  ok(C.A.aliveAtSend === 2 && C.A.payloadEsc === 2 && C.A.received === 2 && C.A.receivedAlive === 2, '★① A 가는 길 — 셋 중 하나가 길 위에서 죽었다(hp 0) → 실은 수 2 → 받는 존이 **둘**을 세운다', txt(C.A));
  ok(C.A2.aliveAtSend === 2 && C.A2.received === 2, '① A2 죽은 호위 몸이 사람 표에서 빠진 꼴도 같다(둘)', txt(C.A2));
  ok(C.B.aliveAtSend === 1 && C.B.payloadEsc === 1 && C.B.received === 1, '★① B 돌아오는 길 — 이웃 존에서 셋 중 둘이 죽었다 → 집 존이 **하나**를 세운다(econ 식 = 셋)', txt(C.B));
  ok(C.C.aliveAtSend === 3 && C.C.received === 2, '① C econ 약탈로 죽은 호위(`escKilled` 1 · 몸은 셋 다 산)는 종전대로 둘 — 실은 수가 econ 식보다 많아도 **늘지 않는다**', txt(C.C));
  ok(C.D.aliveAtSend === 3 && C.D.payloadEsc === 3 && C.D.received === 3, '① D 다 산 넘김(두 존 판의 꼴) → 종전과 같은 셋(무동작)', txt(C.D));
  ok(C.E.payloadEsc === null && C.E.received === 3, '① E 실은 수가 없는 글(종전 존이 보낸 글 · 몸 없이 민 기록) → 종전 econ 수 셋', txt(C.E));
  ok(Object.values(C).every((R) => R.recKeys == null || !R.recKeys.split(',').includes('esc')), '① 기록(`rec`)에는 새 칸 0 — 실은 수는 글 겉(`payload.esc`)에만(받는 econ 무접촉)', C.A.recKeys);
  ok(on.stat && on.stat.h && on.stat.h.escSent === 6 && on.stat.h.escCut === 3, '① `/perf` `xzone.t1292` — 실어 보냄 6(A · A2 · B · C · D · E) · 받아 줄여 세움 3(A · A2 · B — C 는 econ 식이 이미 작다 · E 는 실은 수 없음) · 한 모듈이라 두 존이 같은 표', JSON.stringify(on.stat.h));
}
console.log('\n② 끔(`T1292_XZ_ESC=0` = 종전 글자)');
if (off.err) ok(false, '② 판이 돌았다', off.err);
else {
  const C = off.cases;
  ok(!off.knob && C.A.payloadEsc === null && C.A.received === 3 && C.B.received === 3, '★② 종전 — 글에 실은 수 없음 · A · B 받는 존이 econ 수 셋을 세운다(길 위에서 죽은 호위가 경계 너머에서 다시 선다)', `A: ${txt(C.A)} · B: ${txt(C.B)}`);
  ok(C.C.received === 2 && C.D.received === 3, '② C · D 는 켬과 같다(econ 약탈 죽음 · 다 산 넘김)', `C: ${txt(C.C)} · D: ${txt(C.D)}`);
}
console.log('\n③ 미끼(아이 안 사본 · 파일 무변)');
for (const [k, chk, msg] of [
  ['nocut', (o) => o.cases.A.received === 2 && o.cases.B.received === 1, '받는 존 줄임을 뺀 사본 → ① A · B 가 셋'],
  ['nosend', (o) => o.cases.A.received === 2, '보내는 존 싣기를 뺀 사본 → ① A 가 셋'],
]) {
  const o = child({}, k);
  ok(!o.err && !chk(o), `③ 미끼 ${k} → 빨강 — ${msg}`, o.err ? o.err.slice(0, 160) : `A: ${txt(o.cases.A)} · B: ${txt(o.cases.B)}`);
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
