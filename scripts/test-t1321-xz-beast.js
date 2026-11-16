#!/usr/bin/env node
// @regress
// === scripts/test-t1321-xz-beast.js — 짐승이 존을 넘는 문(T1321 · server/xzone-beast.js)의 몸 보존 =====================
//
// ★무엇을 쥐나(두 존을 한 프로세스에 — 문 두 벌 · 가짜 망 · 가짜 시계 · 존마다 DB 몫(몹 행 · 숨김 줄 · 받은 열쇠)을 따로 쥔다 · 결정론(씨 고정)):
//   ① 띠 — 땅 이웃 쪽 변 밖 COMMIT(256px · zone-config 정본)까지는 이 존 몸으로 걷고 COMMIT 을 넘는 걸음에서만 넘긴다 · 받는 존 자리 = 같은 월드 자리 ·
//      이웃 없는 변(북)은 종전 자르기(false) · 비우기면 새 넘김 0(띠 밖 몸은 false · 띠에 선 몸은 띠 안에서만)
//   ② 넘김 한 번 — 숨김(보낸 존 세계 표에서 빠짐) → 받는 존이 세움 → 답 OK → 보낸 존 DB 행 · 숨김 줄 지움(두 존에 동시에 보임 0 · 사라짐 0)
//   ③ 답을 잃음(받는 존은 받았다) → 숨긴 채 2초 뒤 같은 열쇠 → `dup` → 지움(받는 존 몸 하나)
//   ④ 글을 잃음(받는 존이 못 받았다) → 숨긴 채 다시 → 받음(사라짐 0)
//   ⑤ 연결 안 섬(첫 글) → 드러냄(같은 몸 · 띠 끝 · 2초 창) · 받는 존이 "막힌 칸"이라 답함 → 드러냄
//   ⑥ 모름 규칙 — 답을 잃은 뒤(받는 존은 받았다) 다시 민 글이 연결 실패(받는 존이 내려감) → 숨긴 채(드러내면 둘) → 받는 존이 다시 서면 `dup`
//   ⑦ 보내는 존 재기동(숨긴 채 답을 기다리던 중) — 숨김 줄로 다시 숨기고 같은 열쇠로 다시 민다: 받은 판 → `dup` · 못 받은 판 → 받음(둘 0 · 사라짐 0)
//   ⑧ 받는 존 재기동 — 받은 열쇠가 DB 에 남아 다시 민 글을 `dup` 으로
//   ⑨ 주인 따라 넘김(ⓒ) — `followTarget`(주인 · 넘어간 자리 · 없음) + 한 마리 길든 짐승이 넘어간 자리로 걸어 띠를 건너 받는 존에서 주인을 따라간다(고삐 · 진척 · hp 실림)
//   ⑩ 흔들기 — 두 존 이음매 곁 몸 40 마리를 걷게 하고 망을 무작위로 흔든다(답 잃음 · 글 잃음 · 연결 안 섬 · 막힘 답 · 두 존 재기동) — 걸음마다 불변식:
//      같은 몸이 두 존에 동시에 보임 0 · 데이터에 없는 몸 0(행이 두 존 어디에도 없음) · 망을 고친 뒤 숨김 0 · 숨김 줄 0 · 몸마다 행 하나 · 두 존 합 = 처음 수
// ★미끼(자기검사 — 문이 바뀌면 위가 빨강이어야 한다):
//   ㉠ ACK 전에 지우는 사본(보내는 순간 DB 행을 지운다) → 사라짐이 잡힌다 ㉡ dup 을 받는 사본(받는 문이 열쇠를 안 본다) → 둘이 잡힌다
// 실행: node scripts/test-t1321-xz-beast.js
'use strict';
const path = require('path');
const fs = require('fs');
const { createRequire } = require('module');
const ROOT = path.join(__dirname, '..');
const MOD = path.join(ROOT, 'server', 'xzone-beast.js');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

function loadDoor(variant) {
  let src = fs.readFileSync(MOD, 'utf8');
  if (variant === 'delEarly') {
    const a = "    H.pendPut(key, { mob: m.dbId, to: go.to, data: payload });\n";
    if (!src.includes(a)) throw new Error('미끼 자리 없음(delEarly)');
    src = src.replace(a, a + '    H.delRow(m);   // 미끼 — 답 전에 지운다\n');
  } else if (variant === 'takeDup') {
    const a = "    if (H.seenHas(d.key)) { st.dupIn++; tr('dupIn', { key: d.key, from: peer }); return { ok: true, dup: true }; }\n";
    if (!src.includes(a)) throw new Error('미끼 자리 없음(takeDup)');
    src = src.replace(a, '');
  }
  const m = { exports: {} };
  new Function('module', 'exports', 'require', src)(m, m.exports, createRequire(MOD));
  return m.exports;
}

// ── 결정론 난수 · 가짜 시계 ──────────────────────────────────────────────────────────────
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mkClock() {
  const C = { t: 1e6, q: [], n: 0 };
  C.at = (ms, fn) => { C.q.push({ due: C.t + Math.max(0, ms | 0), fn, n: C.n++ }); };
  C.run = async (ms) => {
    const end = C.t + ms;
    for (;;) {
      await flush();
      C.q.sort((a, b) => (a.due - b.due) || (a.n - b.n));
      const j = C.q[0];
      if (!j || j.due > end) break;
      C.q.shift(); C.t = Math.max(C.t, j.due); j.fn();
    }
    C.t = end; await flush();
  };
  return C;
}
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

// ── 두 존 · 가짜 망 ──────────────────────────────────────────────────────────────────────
//   존 A(서쪽 · 월드 x 0~W) · B(동쪽 · W~2W) · y 같은 원점(한반도 ↔ 닛폰과 같은 꼴). 북쪽 변(y < 0)은 이웃 없음.
const W = 70016, HH = 130016, COMMIT = 256;
function mkWorld(seed, variant) {
  const R = rng(seed), clock = mkClock();
  const Door = loadDoor(variant);
  const net = { mode: [], down: new Set(), log: [] };   // mode = 다음 글들에 쓸 각본(앞에서부터 하나씩 · 없으면 'ok')
  const zones = {};
  const cnt = { in: 0, inA: 0, inB: 0 };   // 받는 존이 세운 수(판 전체 · 재기동을 건너 센다)
  let lidSeq = 0;
  const lidOf = new Map();   // `${존}:${dbId}` → 논리 몸 번호
  const Z = (id) => zones[id];
  const geo = { A: { id: 'A', worldOffsetX: 0, worldOffsetY: 0, isOcean: false }, B: { id: 'B', worldOffsetX: W, worldOffsetY: 0, isOcean: false } };
  const findZoneAt = (ax, ay) => (ay < 0 || ay > HH) ? null : (ax >= 0 && ax < W ? geo.A : (ax >= W && ax < 2 * W ? geo.B : null));
  function boot(id, store) {
    const S = store || { rows: new Map(), pend: new Map(), seen: [], nextId: 1, up: true };
    const world = new Map();
    const z = { id, S, world, drain: false, bootN: (zones[id] ? zones[id].bootN : 0) + 1 };
    const H = {
      zone: id, W, Hh: HH, offX: geo[id].worldOffsetX, offY: 0, bootId: `b${z.bootN}`, retryMs: 2000,
      now: () => clock.t, later: (fn, ms) => clock.at(ms, () => { if (zones[id] === z) fn(); }),   // 죽은 판의 예약은 안 돈다
      neighbors: () => [id === 'A' ? 'B' : 'A'], findZoneAt,
      post: (to, payload) => post(id, to, payload),
      mobs: { add: (m) => { world.set(m.mid, m); }, remove: (m) => { world.delete(m.mid); } },
      spawn: (b, peer) => {
        const dbId = S.nextId++;
        const m = { mid: `m${dbId}`, dbId, type: b.type, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, vx: b.vx, vy: b.vy, homeX: b.x + b.hx, homeY: b.y + b.hy,
          tameOwner: b.tameOwner, tameOwnerName: b.tameOwnerName, tameProgress: b.tameProgress, packId: b.pack };
        S.rows.set(dbId, { dbId, type: b.type, x: b.x, y: b.y, hp: b.hp, tameOwner: b.tameOwner, tameProgress: b.tameProgress });
        lidOf.set(`${id}:${dbId}`, lidOf.get(`${peer}:${b.src}`));
        cnt.in++; cnt['in' + id]++;
        world.set(m.mid, m); return m;
      },
      delRow: (m) => { S.rows.delete(m.dbId); },
      tx: (fn) => { const snap = { rows: new Map(S.rows), pend: new Map(S.pend), seen: S.seen.slice(), nextId: S.nextId }; try { return fn(); } catch (e) { Object.assign(S, snap); throw e; } },
      pendPut: (key, r) => { S.pend.set(key, { key, mob: r.mob, to: r.to, data: JSON.stringify(r.data) }); },
      pendDel: (key) => { S.pend.delete(key); }, pendAll: () => [...S.pend.values()],
      seenHas: (key) => S.seen.includes(key), seenPut: (key) => { S.seen.push(key); if (S.seen.length > 5000) S.seen.shift(); },
      typeOk: () => true, faunaOut: () => false, blocked: (x, y) => !!((z.blocked && z.blocked(x, y)) || (z.blockedRecv && z.blockedRecv(x, y))), drain: () => z.drain, log: () => {},
      peerBlocked: (zid, x, y) => !!(zones[zid] && zones[zid].blocked && zones[zid].blocked(x, y)),   // 이웃 존 땅(지형 정본 몫) — 받는 존만 아는 막힘(`blockedRecv` — 도랑 · 다리 같은 것)은 모른다
    };
    z.door = Door.createBeastDoor(H);
    z.H = H;
    // 다시 뜬 판 — DB 행을 세계에 싣기(zone.js 적재 고리와 같은 차례: 숨김 줄 있는 행은 세우고 곧 숨긴다)
    const P = z.door.bootPend(), rowsSeen = new Set();
    for (const r of [...S.rows.values()].sort((a, b) => a.dbId - b.dbId)) {
      const m = { mid: `m${r.dbId}`, dbId: r.dbId, type: r.type, x: r.x, y: r.y, hp: r.hp, maxHp: 30, vx: 0, vy: 0, homeX: r.x, homeY: r.y, tameOwner: r.tameOwner, tameProgress: r.tameProgress };
      world.set(m.mid, m); rowsSeen.add(r.dbId);
      const pr = P.get(r.dbId); if (pr) z.door.bootHide(m, pr);
    }
    z.door.bootOrphans(P, rowsSeen);
    zones[id] = z;
    return z;
  }
  function post(from, to, payload) {
    const mode = net.mode.length ? net.mode.shift() : 'ok';
    net.log.push({ from, to, key: payload.key, mode });
    const rz = zones[to];
    const down = net.down.has(to);
    return new Promise((res, rej) => {
      const deliver = () => rz.door.receive(JSON.parse(JSON.stringify(payload)));
      if (down || mode === 'refused') return setImmediate(() => rej(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:3021'), { code: 'ECONNREFUSED' })));
      if (mode === 'drop') return setImmediate(() => rej(new Error('timeout')));                 // 글이 안 닿았다(받는 존 모름)
      if (mode === 'lost') { try { deliver(); } catch (e) {} return setImmediate(() => rej(new Error('timeout'))); }   // 받는 존은 받았다 · 답이 안 왔다
      if (mode === 'http500') return setImmediate(() => rej(Object.assign(new Error('HTTP 500'), { status: 500 })));
      let a; try { a = deliver(); } catch (e) { return setImmediate(() => rej(Object.assign(new Error('HTTP 500'), { status: 500 }))); }
      setImmediate(() => res(a));
    });
  }
  function put(id, o) {   // 판 꾸밈 — 존 id 에 몸 하나(DB 행 + 세계 표)
    const z = zones[id], dbId = z.S.nextId++;
    const m = Object.assign({ mid: `m${dbId}`, dbId, type: 'deer', hp: 30, maxHp: 30, vx: 0, vy: 0, homeX: o.x, homeY: o.y, tameOwner: null, tameProgress: 0 }, o);
    z.S.rows.set(dbId, { dbId, type: m.type, x: m.x, y: m.y, hp: m.hp, tameOwner: m.tameOwner, tameProgress: m.tameProgress });
    z.world.set(m.mid, m);
    const lid = ++lidSeq; lidOf.set(`${id}:${dbId}`, lid); m.lid = lid;
    return m;
  }
  // 한 걸음 — zone.js 몹 고리와 같은 차례(띠 → 자리 → 띠를 다 건넜으면 넘김)
  const B = { x: 0, y: 0, go: null };
  function step(id, m, nx, ny) {
    const z = zones[id];
    if (z.door.band(m, nx, ny, B)) { nx = B.x; ny = B.y; } else { nx = Math.max(0, Math.min(W, nx)); ny = Math.max(0, Math.min(HH, ny)); }
    m.x = nx; m.y = ny;
    if (z.door.band(m, nx, ny, B) && B.go) return z.door.send(m, B.go);
    return null;
  }
  // 불변식 — 논리 몸마다: 보이는 존 수 ≤ 1 · 행이 어디엔가 ≥ 1(사라짐 0)
  function audit() {
    const vis = new Map(), rows = new Map();
    for (const id of ['A', 'B']) {
      const z = zones[id];
      for (const m of z.world.values()) { const l = lidOf.get(`${id}:${m.dbId}`); vis.set(l, (vis.get(l) || 0) + 1); }
      for (const r of z.S.rows.values()) { const l = lidOf.get(`${id}:${r.dbId}`); rows.set(l, (rows.get(l) || 0) + 1); }
    }
    let both = 0, gone = 0, dupRows = 0;
    for (let l = 1; l <= lidSeq; l++) { if ((vis.get(l) || 0) > 1) both++; if (!(rows.get(l) > 0)) gone++; if ((rows.get(l) || 0) > 1) dupRows++; }
    return { both, gone, dupRows, n: lidSeq };
  }
  // 망이 다 고쳐진 뒤 — 숨김 0 · 숨김 줄 0 · 몸마다 행 하나 · 보이는 몸 = 몸 수
  function settled() {
    let hid = 0, pend = 0, vis = 0, rows = 0;
    for (const id of ['A', 'B']) { const z = zones[id]; hid += z.door.hidden.size; pend += z.S.pend.size; vis += z.world.size; rows += z.S.rows.size; }
    const a = audit();
    return { hid, pend, vis, rows, ...a, ok: hid === 0 && pend === 0 && vis === a.n && rows === a.n && a.both === 0 && a.gone === 0 && a.dupRows === 0 };
  }
  boot('A'); boot('B');
  return { zones, Z, boot, put, step, audit, settled, clock, net, R, lidOf, cnt };
}

(async () => {
  console.log('\n=== 짐승이 존을 넘는 문 — 두 존 몸 보존 (T1321 · server/xzone-beast.js) ===');

  // ── ① 띠 ───────────────────────────────────────────────────────────────────────────
  console.log('\n[① 띠 — 사람 넘기와 같은 겹침 띠(COMMIT 256px)]');
  {
    const T = loadDoor('').COMMIT;
    ok(T === COMMIT, '①0 띠 = zone-config `HANDOFF_COMMIT`(새 수 0)', `${T}`);
    const w = mkWorld(1);
    const A = w.Z('A'), out = { x: 0, y: 0, go: null };
    const m = w.put('A', { x: W - 10, y: 50000 });
    ok(A.door.band(m, W - 5, 50000, out) === false, '①1 존 안 걸음 = false(종전 자르기 — 항등)');
    ok(A.door.band(m, W + 100, 50000, out) === true && out.x === W + 100 && out.go === null, '①2 띠 안(변 밖 100px) = 이 존 몸으로 걷는다(넘김 0)', JSON.stringify(out));
    ok(A.door.band(m, W + COMMIT + 3, 50010, out) === true && out.go && out.go.to === 'B' && out.go.x === COMMIT + 3 && out.go.y === 50010,
      '①3 띠를 넘는 걸음 = 넘김 · 받는 존 로컬 = 같은 월드 자리(순간이동 0)', JSON.stringify(out.go));
    ok(A.door.band(m, 5000, -50, out) === false, '①4 이웃 없는 변(북) = false(종전 자르기)');
    ok(A.door.band(m, -50, 5000, out) === false, '①5 서쪽 변(월드 밖 · 존 없음) = false');
    A.drain = true;
    ok(A.door.band(m, W + 100, 50000, out) === false, '①6 비우기 — 존 안 몸은 띠로 못 나간다(새 넘김 0)');
    m.x = W + 50;
    ok(A.door.band(m, W + COMMIT + 9, 50000, out) === true && out.go === null && out.x === W + COMMIT, '①7 비우기 — 띠에 선 몸은 띠 안에서만(넘김 0 · 띠 끝에서 선다)', JSON.stringify(out));
    A.drain = false;
    m._t1321FailAt = w.clock.t;
    ok(A.door.band(m, W + COMMIT + 9, 50000, out) === true && out.go === null && out.x === W + COMMIT, '①8 막 실패한 몸(2초 창 — 사람 넘기 `fireHandoff` 의 창) = 띠 끝에 선다');
    w.clock.t += 2001;
    ok(A.door.band(m, W + COMMIT + 9, 50000, out) === true && !!out.go, '①9 창이 지나면 다시 넘긴다');
    const B = w.Z('B'), mb = w.put('B', { x: 30, y: 7000 });
    ok(B.door.band(mb, -COMMIT - 2, 7000, out) === true && out.go && out.go.to === 'A' && out.go.x === W - COMMIT - 2, '①10 반대쪽(B → A) — 받는 존 로컬 = 같은 월드 자리', JSON.stringify(out.go));
    //   띠는 이웃 존 땅 — 그 땅이 바위면 띠 걸음 · 넘김 자리 둘 다 안 간다(제자리)
    B.blocked = (x, y) => x < 300 && y > 59000 && y < 61000;   // B 서쪽 끝 300px 띠 모양 능선(y 59,000 ~ 61,000)
    const mr = w.put('A', { x: W - 5, y: 60000 });
    ok(A.door.band(mr, W + 40, 60000, out) === true && out.x === W - 5 && out.y === 60000 && out.go === null, '①11 띠 땅이 바위(이웃 존 지형) — 띠로 못 들어간다(제자리 · 지형 막힘과 같은 꼴)', JSON.stringify(out));
    mr.x = W + 250;
    ok(A.door.band(mr, W + COMMIT + 5, 60000, out) === true && out.go === null && out.x === W + 250, '①12 넘김 자리가 바위 — 넘기지 않는다(제자리 · 받는 존에 글 0)', JSON.stringify(out));
    ok(A.door.band(mr, W + 100, 62000, out) === true && out.x === W + 100 && out.y === 62000, '①13 능선 밖 띠 땅은 걷는다', JSON.stringify(out));
    B.blocked = null;
  }

  // ── ② 넘김 한 번 ──────────────────────────────────────────────────────────────────
  console.log('\n[② 넘김 한 번 — 숨김 → 세움 → 답 OK → 지움]');
  {
    const w = mkWorld(2);
    const m = w.put('A', { x: W + COMMIT - 1, y: 40000, type: 'wolf', hp: 33, vx: 50, vy: 0, homeX: W - 100, homeY: 40010, packId: 'p7' });
    const key = w.step('A', m, W + COMMIT + 4, 40000);
    const A = w.Z('A'), B = w.Z('B');
    ok(!!key && !A.world.has(m.mid) && A.S.rows.has(m.dbId) && A.S.pend.has(key), '②1 보낸 순간 — 이 존 세계 표에서 빠지고(숨김) DB 행 · 숨김 줄은 남는다', key);
    let a = w.audit(); ok(a.both === 0 && a.gone === 0, '②2 보낸 순간 불변식(두 존 보임 0 · 사라짐 0)', JSON.stringify(a));
    await w.clock.run(10);
    const nb = [...B.world.values()][0];
    ok(B.world.size === 1 && nb && nb.type === 'wolf' && nb.hp === 33 && nb.x === COMMIT + 4 && nb.y === 40000, '②3 받는 존이 같은 월드 자리에 같은 몸(종 · hp)을 세운다', nb ? JSON.stringify({ x: nb.x, y: nb.y, hp: nb.hp }) : '없음');
    ok(nb && nb.homeX === COMMIT + 4 + (W - 100 - (W + COMMIT + 4)) && nb.packId === 'p7@A', '②4 집 자리 차이 · 무리 표(보낸 존 이름 한 번)', nb ? `${nb.homeX} · ${nb.packId}` : '');
    ok(!A.S.rows.has(m.dbId) && !A.S.pend.has(key) && A.door.hidden.size === 0, '②5 답 OK — 보낸 존 DB 행 · 숨김 줄 지움');
    const s = w.settled(); ok(s.ok, '②6 끝 — 몸 하나 · 행 하나 · 숨김 0', JSON.stringify(s));
    ok(A.door.st.out === 1 && B.door.st.in === 1 && A.door.st.dup === 0, '②7 셈 — 나감 1 · 들어옴 1 · dup 0');
  }

  // ── ③ 답을 잃음 ──────────────────────────────────────────────────────────────────
  console.log('\n[③ 답을 잃음(받는 존은 받았다) → 숨긴 채 다시 → dup]');
  {
    const w = mkWorld(3);
    w.net.mode.push('lost');
    const m = w.put('A', { x: W + COMMIT, y: 41000 });
    const key = w.step('A', m, W + COMMIT + 2, 41000);
    await w.clock.run(10);
    const A = w.Z('A'), B = w.Z('B');
    ok(B.world.size === 1 && A.door.hidden.size === 1 && A.S.rows.has(m.dbId), '③1 답을 잃은 뒤 — 받는 존에 하나 · 보낸 존은 숨긴 채(행은 데이터로 남는다)');
    let a = w.audit(); ok(a.both === 0 && a.gone === 0, '③2 그 사이 두 존 보임 0 · 사라짐 0', JSON.stringify(a));
    await w.clock.run(2100);
    ok(B.world.size === 1 && B.S.rows.size === 1 && A.door.st.dup === 1 && B.door.st.dupIn === 1, '③3 2초 뒤 같은 열쇠 → dup — 받는 존은 그대로 하나', `B 행 ${B.S.rows.size}`);
    const s = w.settled(); ok(s.ok, '③4 끝 — 몸 하나 · 행 하나', JSON.stringify(s));
  }

  // ── ④ 글을 잃음 ──────────────────────────────────────────────────────────────────
  console.log('\n[④ 글을 잃음(받는 존이 못 받았다) → 숨긴 채 다시 → 받음]');
  {
    const w = mkWorld(4);
    w.net.mode.push('drop', 'drop');
    const m = w.put('A', { x: W + COMMIT, y: 42000 });
    w.step('A', m, W + COMMIT + 2, 42000);
    await w.clock.run(10);
    ok(w.Z('B').world.size === 0 && w.Z('A').door.hidden.size === 1, '④1 못 받은 판 — 어디에도 안 보인다(숨김 · 행은 보낸 존)');
    await w.clock.run(4200);
    const s = w.settled(); ok(s.ok && w.Z('B').world.size === 1, '④2 두 번 더 민 뒤 받음 — 사라짐 0', JSON.stringify(s));
  }

  // ── ⑤ 연결 안 섬 · 막힘 답 ─────────────────────────────────────────────────────────
  console.log('\n[⑤ 받는 존이 확실히 안 받았다 → 드러냄(같은 몸 · 띠 끝 · 2초 창)]');
  {
    const w = mkWorld(5);
    w.net.mode.push('refused');
    const m = w.put('A', { x: W + COMMIT, y: 43000 });
    w.step('A', m, W + COMMIT + 7, 43000);
    await w.clock.run(10);
    const A = w.Z('A');
    ok(A.world.get(m.mid) === m && m.x === W + COMMIT && m._t1321FailAt === w.clock.t - 10 + 0 || (A.world.get(m.mid) === m && m.x === W + COMMIT), '⑤1 연결 안 섬(첫 글) — 같은 몸(mid) 띠 끝에 다시 보인다', `x ${m.x}`);
    ok(w.Z('B').world.size === 0 && A.S.pend.size === 0 && A.door.st.unhide === 1, '⑤2 받는 존 0 · 숨김 줄 0');
    const w2 = mkWorld(6);
    w2.Z('B').blockedRecv = () => true;   // 받는 존만 아는 막힘(보낸 존의 이웃 땅 술어는 모른다 — 받는 존이 정본)
    const m2 = w2.put('A', { x: W + COMMIT, y: 44000 });
    w2.step('A', m2, W + COMMIT + 7, 44000);
    await w2.clock.run(10);
    ok(w2.Z('A').world.has(m2.mid) && w2.Z('B').world.size === 0 && w2.Z('B').door.st.refuse['in:blocked'] === 1, '⑤3 받는 존 "막힌 칸" 답 — 드러냄(받는 존이 답했다 = 그쪽에 없다)');
    const w3 = mkWorld(7);
    w3.net.mode.push('http500');
    const m3 = w3.put('A', { x: W + COMMIT, y: 45000 });
    w3.step('A', m3, W + COMMIT + 7, 45000);
    await w3.clock.run(10);
    ok(w3.Z('A').world.has(m3.mid) && w3.settled().ok, '⑤4 오류 코드(HTTP 500 — 받는 쪽 거래 되감기) = 답 — 드러냄', JSON.stringify(w3.settled()));
  }

  // ── ⑥ 모름 규칙 ──────────────────────────────────────────────────────────────────
  console.log('\n[⑥ 모름 규칙 — 답을 잃은 뒤 다시 민 글의 연결 실패로는 안 드러낸다]');
  {
    const w = mkWorld(8);
    w.net.mode.push('lost');
    const m = w.put('A', { x: W + COMMIT, y: 46000 });
    w.step('A', m, W + COMMIT + 2, 46000);
    await w.clock.run(10);
    w.net.down.add('B');
    await w.clock.run(2100);
    const A = w.Z('A');
    ok(A.door.hidden.size === 1 && !A.world.has(m.mid) && A.door.st.keepUnsure >= 1, '⑥1 받는 존 내려감(연결 실패) — 앞 글이 닿았을 수 있어 숨긴 채', `keepUnsure ${A.door.st.keepUnsure}`);
    let a = w.audit(); ok(a.both === 0 && a.gone === 0, '⑥2 그 사이 두 존 보임 0', JSON.stringify(a));
    w.net.down.delete('B');
    await w.clock.run(2100);
    const s = w.settled(); ok(s.ok && A.door.st.dup === 1, '⑥3 받는 존이 다시 서면 dup — 하나', JSON.stringify(s));
  }

  // ── ⑦ 보내는 존 재기동 ─────────────────────────────────────────────────────────────
  console.log('\n[⑦ 보내는 존 재기동 — 숨김 줄로 다시 숨기고 같은 열쇠로 다시 민다]');
  for (const [tag, mode] of [['받은 판', 'lost'], ['못 받은 판', 'drop']]) {
    const w = mkWorld(9);
    w.net.mode.push(mode);
    const m = w.put('A', { x: W + COMMIT, y: 47000, type: 'boar' });
    const key = w.step('A', m, W + COMMIT + 2, 47000);
    await w.clock.run(10);
    const S = w.Z('A').S;
    const A2 = w.boot('A', S);   // 같은 DB 몫으로 다시 뜸(메모리 0)
    ok(A2.door.hidden.size === 1 && !A2.world.has(m.mid) && A2.door.hidden.get(key) && A2.door.hidden.get(key).unsure, `⑦1 ${tag} — 다시 뜬 판이 그 몸을 세우되 숨긴다(모름)`, key);
    let a = w.audit(); ok(a.both === 0 && a.gone === 0, `⑦2 ${tag} — 다시 뜬 직후 두 존 보임 0 · 사라짐 0`, JSON.stringify(a));
    await w.clock.run(10);
    const s = w.settled(); ok(s.ok && w.Z('B').world.size === 1, `⑦3 ${tag} — 다시 민 뒤 받는 존 하나(${mode === 'lost' ? 'dup' : '받음'}) · 보낸 존 0`, JSON.stringify(s) + ` · dup ${A2.door.st.dup}`);
  }

  // ── ⑧ 받는 존 재기동 ─────────────────────────────────────────────────────────────
  console.log('\n[⑧ 받는 존 재기동 — 받은 열쇠가 DB 에 남는다]');
  {
    const w = mkWorld(10);
    w.net.mode.push('lost');
    const m = w.put('A', { x: W + COMMIT, y: 48000 });
    w.step('A', m, W + COMMIT + 2, 48000);
    await w.clock.run(10);
    w.boot('B', w.Z('B').S);
    await w.clock.run(2100);
    const s = w.settled(); ok(s.ok && w.Z('B').world.size === 1 && w.Z('B').door.st.dupIn === 1, '⑧1 다시 뜬 받는 존이 다시 민 글을 dup 으로 — 하나', JSON.stringify(s));
  }

  // ── ⑨ 주인 따라 넘김 ─────────────────────────────────────────────────────────────
  console.log('\n[⑨ 길든 짐승 — 주인을 따라 같은 띠 · 같은 문으로]');
  {
    const w = mkWorld(11);
    const A = w.Z('A'), B = w.Z('B');
    const f = A.door.followTarget;
    ok(JSON.stringify(f({ x: 5, y: 6 }, { x: 1, y: 2 })) === JSON.stringify({ x: 5, y: 6, gone: false }) && JSON.stringify(f(null, { x: 1, y: 2 })) === JSON.stringify({ x: 1, y: 2, gone: true }) && f(null, null) === null && f(null, { x: NaN, y: 1 }) === null,
      '⑨1 따라갈 자리 — 주인이 있으면 주인 · 넘어간 자리면 그 자리 · 없으면 null(종전대로 선다)');
    const gone = { x: W + COMMIT + 6, y: 49000 };   // 주인이 넘어간 자리(사람 넘기 — 띠를 넘는 걸음 자리)
    const m = w.put('A', { x: W - 900, y: 49300, type: 'horse', hp: 21, tameOwner: 'u1', tameOwnerName: '재', tameProgress: 3 });
    let key = null, steps = 0;
    for (; steps < 400 && !key; steps++) {   // 따라가기 걸음 = 속도 0.7 × 종 속도(여기서는 걸음당 8px 쯤) · 멈춤 거리 0
      const t = f(null, gone); const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy);
      const sp = Math.min(8, d);
      key = w.step('A', m, m.x + dx / d * sp, m.y + dy / d * sp);
    }
    await w.clock.run(10);
    const nb = [...B.world.values()][0];
    ok(!!key && nb && nb.tameOwner === 'u1' && nb.tameOwnerName === '재' && nb.tameProgress === 3 && nb.hp === 21, '⑨2 넘어간 자리로 걸어 띠를 건넌다 — 받는 존에 고삐(주인 칸 둘) · 진척 · hp 그대로', nb ? JSON.stringify({ x: Math.round(nb.x), y: Math.round(nb.y), o: nb.tameOwner, p: nb.tameProgress }) : `걸음 ${steps}`);
    ok(nb && Math.abs((nb.x + W) - (W + COMMIT + 6)) <= 9 && Math.abs(nb.y - 49000) <= 9 && w.settled().ok, '⑨3 받는 존 자리 = 주인이 넘어간 월드 자리 곁(순간이동 0) · 몸 하나', nb ? `${Math.round(nb.x + W)} · ${Math.round(nb.y)}` : '');
    const tB = f({ x: nb.x + 300, y: nb.y }, null);
    ok(tB && tB.gone === false && tB.x === nb.x + 300, '⑨4 받는 존 — 주인이 있으면 주인을 따라간다');
  }

  // ── ⑩ 흔들기 ─────────────────────────────────────────────────────────────────────
  console.log('\n[⑩ 흔들기 — 이음매 곁 몸 40 · 망 흔들기 · 두 존 재기동 · 걸음마다 불변식]');
  const soak = async (seed, variant) => {
    const w = mkWorld(seed, variant);
    const R = w.R;
    for (let i = 0; i < 20; i++) { w.put('A', { x: W - 400 + R() * 380, y: 30000 + R() * 2000, type: i % 3 ? 'deer' : 'wolf', tameOwner: i === 0 ? 'u9' : null }); w.put('B', { x: 20 + R() * 380, y: 30000 + R() * 2000, type: 'ibex' }); }
    const n0 = w.audit().n;
    let worstBoth = 0, worstGone = 0, worstDup = 0, sends = 0, restarts = 0;
    const MODES = ['ok', 'ok', 'ok', 'lost', 'drop', 'refused', 'http500'];
    for (let t = 0; t < 1500; t++) {
      if (R() < 0.08) w.net.mode.push(MODES[(R() * MODES.length) | 0]);
      if (R() < 0.01) { const id = R() < 0.5 ? 'A' : 'B'; w.boot(id, w.Z(id).S); restarts++; }
      if (R() < 0.01) { const id = R() < 0.5 ? 'A' : 'B'; if (w.net.down.has(id)) w.net.down.delete(id); else w.net.down.add(id); }
      for (const id of ['A', 'B']) for (const m of [...w.Z(id).world.values()]) {
        const ang = R() * 2 * Math.PI, sp = 40 + R() * 60;
        if (w.step(id, m, m.x + Math.cos(ang) * sp + (id === 'A' ? 6 : -6), m.y + Math.sin(ang) * sp)) sends++;
      }
      await w.clock.run(250);
      const a = w.audit();
      worstBoth = Math.max(worstBoth, a.both); worstGone = Math.max(worstGone, a.gone); worstDup = Math.max(worstDup, a.dupRows);
    }
    w.net.down.clear(); w.net.mode.length = 0;
    await w.clock.run(20000);
    return { w, n0, worstBoth, worstGone, worstDup, sends, restarts, s: w.settled() };
  };
  {
    const r = await soak(1321);
    const A = r.w.Z('A'), B = r.w.Z('B');
    console.log(`  · 보냄 ${r.sends} · 받는 존이 세움 ${r.w.cnt.in}(A ← B ${r.w.cnt.inA} · B ← A ${r.w.cnt.inB}) · 재기동 ${r.restarts} · 끝 A ${A.world.size} · B ${B.world.size}`);
    ok(r.sends >= 100 && r.restarts >= 5 && r.w.cnt.inA >= 20 && r.w.cnt.inB >= 20, '⑩0 [전제] 흔들기가 실제로 두 쪽으로 넘기고 재기동했다', `보냄 ${r.sends} · 세움 A ${r.w.cnt.inA} · B ${r.w.cnt.inB} · 재기동 ${r.restarts}`);
    ok(r.worstBoth === 0, '⑩1 걸음마다 같은 몸이 두 존에 동시에 보인 때 0', `${r.worstBoth}`);
    ok(r.worstGone === 0, '⑩2 걸음마다 데이터에 없는 몸 0(사라짐 0)', `${r.worstGone}`);
    ok(r.s.ok && r.s.n === r.n0 && r.s.vis === r.n0, '⑩3 망을 고친 뒤 — 숨김 0 · 숨김 줄 0 · 몸마다 행 하나 · 두 존 합 = 처음 수', JSON.stringify(r.s));
  }

  // ── 미끼 ─────────────────────────────────────────────────────────────────────────
  console.log('\n[미끼 — 문이 바뀌면 위 자가 빨강이어야 한다]');
  {
    const r = await soak(1321, 'delEarly');
    ok(r.worstGone > 0 || !r.s.ok, '㉠ ACK 전에 지우는 사본 — 사라짐이 잡힌다(빨강)', `걸음 최악 사라짐 ${r.worstGone} · 끝 ${JSON.stringify(r.s)}`);
    const w = mkWorld(12, 'delEarly');
    w.net.mode.push('refused');
    const m = w.put('A', { x: W + COMMIT, y: 50000 });
    w.step('A', m, W + COMMIT + 2, 50000);
    await w.clock.run(10);
    ok(!w.settled().ok, '㉠2 ACK 전에 지우는 사본 — 연결 안 섬 한 번에 행이 사라진다(빨강)', JSON.stringify(w.settled()));
  }
  {
    const r = await soak(1321, 'takeDup');
    ok(r.worstDup > 0 || !r.s.ok, '㉡ dup 을 받는 사본 — 둘이 잡힌다(빨강)', `걸음 최악 행 둘 ${r.worstDup} · 끝 ${JSON.stringify(r.s)}`);
    const w = mkWorld(13, 'takeDup');
    w.net.mode.push('lost');
    const m = w.put('A', { x: W + COMMIT, y: 51000 });
    w.step('A', m, W + COMMIT + 2, 51000);
    await w.clock.run(2200);
    ok(w.Z('B').world.size === 2 && !w.settled().ok, '㉡2 dup 을 받는 사본 — 답 한 번 잃으면 받는 존에 둘(빨강)', `B 몸 ${w.Z('B').world.size}`);
  }

  console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
