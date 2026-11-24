#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// @bait 7   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다 — 미끼 하나에 판정 줄 하나)
// === scripts/test-t1448-road-grid.js — 길 장부를 칸 배열로(`T1448_ROAD_GRID` 끔 기본 · `=1` 켬) [T1448 · S2 · 2026-11-23] ==========================
//
// ★지키는 것(정본 `server/roads.js` · `server/road-grid.js` 를 그대로 부른다 — 아이마다 임시 존 DB · 마을 문은 조각 예산 1ms 의 대역):
//   ① 그릇(`road-grid.js`) — Map · Set 과 같은 답(무작위 넣고 빼기 2만 번 · 크기 · 있음 · 값 · 칸 키 오름 차례 · 구역 경계 · 존 가장자리(폭 · 높이가 32 배수 아님)) ·
//      덩이 글 꼴 되읽기 = 값 그대로(Float64 · 1 + 2⁻⁵² 같은 끝자리까지) · 빈 구역 배열 0
//   ② 끔 ↔ 켬 같은 세계 — 같은 판(날마다 같은 밟기 · 보기 · 날 넘김 · 얼린 뒤 밟기) 60날: 날마다 칸 전수(키 · 값 · 날) · 돌려준 등급 줄 · 코스 지도 · 오름 셈 ·
//      등급 칸 셈 · 다진 길 모음 · T688 표 · 내일 풀릴 칸 · 바뀐 코스 칸 · 교역로 할인 · 방송(차례까지) — 같음.
//      차례만 갈리는 자리(welcome `clientRoads` 나열 · `pavedKeys`)는 모음이 같고 차례가 다른 날을 센다(보고 표) · 보이는 구역만 문(`clientRoadsBox`) = 그 상자 안 welcome
//      T688 끈 판(`T688_ROAD_DAY=0` — 종전 전수 재구축)도 같은 판 30날
//   ③ 저장 — 날마다 DB(끔 = 칸 행 · 켬 = 구역 행 되읽기) = 그날 경계 값(얼린 순간 칸 전수) — 얼린 뒤 바뀐 칸(얼린 키 · 얼린 구역의 다른 칸 · 새 칸 · 닳아 지운 칸)이 섞여도
//   ④ 부팅 — 옛 DB(칸 행)로 켬 부팅 = 한 거래 이관(칸 행 0 · 구역 행 = 칸 있는 구역 수) · 끔 부팅과 같은 장부(부팅 풀림 줄 차례까지) · 다시 켬 부팅 = 쓰기 0 ·
//      켰던 DB 끔 부팅 = 되돌림(칸 행 = 처음 칸 행 그대로) · 이관 중 죽음 = DB 앞 그대로(칸 행 그대로 · 구역 행 0) → 다음 부팅 이관 ·
//      이관 도구 `--forward` 구역 행 = 부팅 이관 구역 행(덩이 글자까지) · `--back` 칸 행 = 처음 칸 행
//   ⑤ 다시 뜬 판(`t1382Dump/Load` — 존 종료 저장) — 켬 덤프 → 켬 되올림 · 켬 덤프 → 끔 되올림 · 끔 덤프 → 켬 되올림 30날 = 끊김 없는 판 30날(값 · 지도 · 다진 길 · 표)
//   ⑥ 메모리 — 배열이 선 구역 = 밟힌 구역(빈 구역 0) · 바이트 = 구역(16 × 16칸) × 3,072(값 8 + 날 4)
//   ⑦ 미끼 일곱(한 자리만 바꾼 사본 · 정본 파일 무변): f32(값을 32비트로 → ②) · dead(다 닳은 칸을 0 으로 안 적는다 → ②) · edge(구역 끝 열을 안 돈다 → ②) ·
//      prealloc(밟힌 적 없는 구역 배열을 미리 다 만든다 → ⑥) · cow(구역 행에 얼린 뒤 값을 적는다 → ③) · resume(되올린 값이 32비트 → ⑤) ·
//      order(방송 차례를 칸 키 오름으로 → ② 방송 차례 — 모음 · 값은 같은데 "같음"이라 하면 안 되는 자리)
//
// 실행: node scripts/test-t1448-road-grid.js
'use strict';
if (require.main === module && !process.env.T1448H_CHILD) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, execFileSync } = require('child_process');
const LB = require('./lib-bait');
const ROOT = path.join(__dirname, '..');
const RGF = 'server/road-grid.js', RDF = 'server/roads.js';
const CHILD = process.env.T1448H_CHILD || '', MUT = process.env.T1448H_MUT || '';
const W = 200, H = 140, ZONE = 'hanbando';   // 존 칸 — 폭 · 높이가 구역(16) · 화면 상자(32) 배수가 아니다(끝 열 8칸 · 끝 줄 12칸)
let RGC = null; try { RGC = require(path.join(ROOT, RGF)); } catch (e) { RGC = null; }   // 그릇 정본(옛 제품엔 없다 — 그때는 아래 판정이 ✗ 로 선다 · 옛 코드 빨강 게이트)
const GC = RGC ? RGC.C : 16, GSH = RGC ? RGC.SHIFT : 4, GMK = GC - 1, GWn = Math.ceil(W / GC), GHn = Math.ceil(H / GC), CHB = (RGC ? RGC.CC : 256) * 12;   // 저장 구역 · 구역 바이트
const J = JSON.stringify;
const hash = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : J(x)).digest('hex').slice(0, 12);

// 미끼 — 이름: [파일 · 바꿀 글자(그 파일에 정확히 1곳) · 새 글자]
const BAITS = {
  f32: [RGF, '_mk(ci) { const c = { v: new Float64Array(CC)', '_mk(ci) { const c = { v: new Float32Array(CC)'],
  dead: [RGF, 'c.v[i] = 0; c.d[i] = 0; c.n--; this.size--; return true; }', 'c.n--; this.size--; return true; }'],
  edge: [RGF, 'for (let lx = 0; lx < xn; lx++) { const i = base | lx, x = v[i]; if (x > 0) fn(rb + x0 + lx, x, d[i] + b); }', 'for (let lx = 0; lx < xn - 1; lx++) { const i = base | lx, x = v[i]; if (x > 0) fn(rb + x0 + lx, x, d[i] + b); }'],   // 구역 끝 열(15 · 31 · …)
  prealloc: [RGF, 'this.nCh = 0; this.size = 0;\n  }', 'this.nCh = 0; this.size = 0;\n    for (let ci = 0; ci < this.ch.length; ci++) this._mk(ci);\n  }'],
  cow: [RDF, 'sn = F.snap.size > 0, db', 'sn = false, db'],
  resume: [RDF, 'if (T1448) S.cells.unpackChunk(ci, p.li, p.v, p.d);', 'if (T1448) S.cells.unpackChunk(ci, p.li, Float64Array.from(p.v, Math.fround), p.d);'],
  order: [RDF, '_fl.written = new Set(); }', '_fl.written = new Set(); _fl.it = [...keys].sort((a, b) => a - b).values(); }'],
};
const siteN = (name) => { const B = BAITS[name]; try { return LB.count(fs.readFileSync(path.join(ROOT, B[0]), 'utf8'), B[1]); } catch (e) { return 0; } };

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ══ 아이 — 길 모듈 하나(임시 DB · 정본 함수) ══════════════════════════════════════════════════════════════════════════
if (CHILD) {
  const out = { child: CHILD, arm: process.env.T1448_ROAD_GRID === '1' ? 'on' : 'off', mut: MUT || null, err: null, days: [] };
  const logs = [];
  try {
    process.env.ENABLE_VILLAGES = '0';
    process.env.DB_PATH = process.env.T1448H_DB;
    if (MUT) {   // 한 자리만 바꾼 사본으로 싣는다(파일 무변 · 자리 수는 어미가 이미 셌다)
      const M = require('module'), old = M._extensions['.js'], B = BAITS[MUT];
      M._extensions['.js'] = function (m, f) { if (f !== path.join(ROOT, B[0])) return old(m, f); m._compile(fs.readFileSync(f, 'utf8').replace(B[1], B[2]), f); };
      delete require.cache[require.resolve(path.join(ROOT, B[0]))];   // 위에서 상수만 읽으려 실은 정본 — 길 모듈이 사본을 싣게 비운다
    }
    //   마을 문 대역 — 조각 예산 1ms(묶음이 여럿으로 쪼개진다) · 하루 마감 쉼 없음. 길 모듈은 `villages` 캐시 칸만 본다(`_rVil`).
    const vp = require.resolve(path.join(ROOT, 'server/villages.js'));
    require.cache[vp] = { id: vp, filename: vp, loaded: true, exports: { tickSliceMs: () => 1, villagesBusy: () => false }, children: [], paths: [] };
    const l0 = console.log, e0 = console.error;
    console.log = (...a) => { logs.push(a.join(' ')); }; console.error = (...a) => { logs.push('E ' + a.join(' ')); };
    const DB = require(path.join(ROOT, 'server/zone-local-db.js'));
    const R = require(path.join(ROOT, RDF));
    const FAILAT = parseInt(process.env.T1448H_FAILAT || '0', 10);
    if (FAILAT) { const up = DB.upsertRoadChunk; let n = 0; DB.upsertRoadChunk = function (...a) { if (++n === FAILAT) throw new Error('T1448H 주입 — 이관 중 죽음'); return up.apply(this, a); }; }
    const D0 = parseInt(process.env.T1448H_D0 || '0', 10), D1 = parseInt(process.env.T1448H_D1 || '0', 10);
    let DAY = D0;
    //   묶음 실패 주입(`T1448H_FAILDAY=d`) — 날 d 를 닫는 저장의 셋째 쓰기에서 한 번 던진다(끔 = 칸 행 · 켬 = 구역 행) · 그날 끝(방송 · `S.sent` 고침) 없음 · 남은 키는 다음 날
    const FAILDAY = parseInt(process.env.T1448H_FAILDAY || '-1', 10);
    if (FAILDAY >= 0) for (const fn of ['upsertRoadChunk', 'upsertRoadCell']) { const up = DB[fn]; let n = 0; DB[fn] = function (...a) { if (DAY === FAILDAY + 1 && !out.failed && ++n === 3) { out.failed = DAY; throw new Error('T1448H 묶음 실패 주입'); } return up.apply(this, a); }; }
    const BC = [], DOFF = +(process.env.T1448H_DOFF || 0);   // 길 날 맞춤 몫(250ms 판 자의 날 71억 꼴)
    R.setEconDay(() => DAY + DOFF);
    R.init({ zoneId: ZONE, cellsW: W, cellsH: H, epoch: 0, dayMs: 600000, broadcast: (m) => BC.push(J(m)) });
    const S = R._S;
    out.ready = S.ready; out.t1448 = R.T1448; out.boot = S.t1448Boot || null;
    let today = new Set();   // 그날 하네스가 밟고 본 칸(판 글자가 제품 속 모음에 안 기대게 — 묶음 실패로 남은 키가 다음 날 판을 바꾸지 않는다) · 덤프 곁 `_h` 에 싣는다
    if (process.env.T1448H_LOAD) { const o = JSON.parse(fs.readFileSync(process.env.T1448H_LOAD, 'utf8')); if (o._h) today = new Set(o._h.today); out.loaded = R.t1382Load(o); }
    R.takeCoarseChanges();   // 바뀐 코스 칸을 모으기 시작(교역로 다시 파기 문)
    const cellsOf = () => { const a = []; for (const [k, r] of S.cells) a.push([k, r.v, r.d]); a.sort((x, y) => x[0] - y[0]); return a; };
    const tri = (a) => { const o = []; for (let i = 0; i < a.length; i += 3) o.push([a[i], a[i + 1], a[i + 2]]); return o; };
    const sortTri = (a) => tri(a || []).sort((x, y) => (x[1] - y[1]) || (x[0] - y[0]));
    const dbCells = () => {
      const o = [];
      if (R.T1448) {
        const RG = RGC, GW = GWn;
        const has = DB.db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='road_chunks'").get();
        if (has) for (const r of DB.db.prepare('SELECT ck, data FROM road_chunks WHERE zone = ?').all(ZONE)) { const p = RG.decodeChunk(r.data), gy = (r.ck / GW) | 0, gx = r.ck - gy * GW; for (let j = 0; j < p.n; j++) { const i = p.li[j]; o.push([((gy << GSH) + (i >> GSH)) * W + (gx << GSH) + (i & GMK), p.v[j], p.d[j]]); } }
      }
      for (const r of DB.db.prepare('SELECT cell_key, v, d FROM roads WHERE zone = ?').all(ZONE)) o.push([r.cell_key, r.v, r.d]);
      return o.sort((x, y) => x[0] - y[0]);
    };
    const dbRows = () => {
      const t = DB.db.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='road_chunks'").get();
      return { cell: DB.db.prepare('SELECT COUNT(*) AS n FROM roads WHERE zone = ?').get(ZONE).n, chunkTab: !!t,
        chunk: t ? DB.db.prepare('SELECT COUNT(*) AS n FROM road_chunks WHERE zone = ?').get(ZONE).n : 0,
        chunkH: t ? hash(DB.db.prepare('SELECT ck, n, hex(data) AS h FROM road_chunks WHERE zone = ? ORDER BY ck').all(ZONE)) : null,
        cellH: hash(DB.db.prepare('SELECT cell_key, v, d FROM roads WHERE zone = ? ORDER BY cell_key').all(ZONE).map((r) => [r.cell_key, r.v, r.d])) };
    };
    const state = () => ({ cells: hash(cellsOf()), n: S.cells.size, coarse: hash([...S.coarse].sort((a, b) => a[0] - b[0])), gen: S.coarseGen, graded: S.stats.graded,
      paved: hash([...S.paved].sort((a, b) => a - b)), pavedN: S.paved.size, bootUn: hash(S.bootUnpaved || []), bootUnN: (S.bootUnpaved || []).length,
      chunks: new Set([...S.cells.keys()].map((k) => ((((k / W) | 0) >> GSH) * GWn) + ((k % W) >> GSH))).size,
      perf: (() => { const p = R.roadDayPerf(); return p ? [p.lvl, p.sched, p.dueDays] : null; })() });
    out.boot0 = { state: state(), rows: dbRows(), log: logs.filter((l) => /T1448/.test(l)) };
    const touched = new Set();
    const ck = (cx, cy) => (cy >> GSH) * GWn + (cx >> GSH);
    const stamp = (cx, cy, acc) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H) { touched.add(ck(cx, cy)); today.add(cy * W + cx); } acc.push(R.stampCell(cx, cy)); };
    const look = (cx, cy, acc) => { if (cx >= 0 && cy >= 0 && cx < W && cy < H) today.add(cy * W + cx); acc.push(R.levelOf(cx, cy)); };
    for (let day = D0; day < D1; day++) {
      const rng = mulberry32(7919 * (day + 1)), ri = (n) => (rng() * n) | 0, lv = [], lr = [];
      const nb = BC.length, nLog = logs.length;
      // 낮 — 길 A(가로 · 구역 경계(16 · 32 둘 다) y = 31 · 32 · 날 0 ~ 34 짙게) · 길 B(세로 x = 63 · 64 · 날 12 ~) · 길 C(대각 · 늘 옅게) · 가장자리(x = W-1 · y = H-1 · 0) · 흩뿌림
      if (day < 35) for (let x = 0; x < W; x++) for (const y of [31, 32]) { const m = 1 + ri(3); for (let q = 0; q < m; q++) stamp(x, y, lv); }
      if (day >= 12) for (let y = 0; y < 100; y++) for (const x of [63, 64]) { const m = ri(4); for (let q = 0; q < m; q++) stamp(x, y, lv); }
      for (let t = 0; t < 120; t++) { if (rng() < 0.5) stamp(t, (t * 0.6) | 0, lv); }
      for (let t = 0; t < 40; t++) { stamp(W - 1, ri(H), lv); stamp(ri(W), H - 1, lv); stamp(0, ri(80), lv); }
      for (let t = 0; t < 150; t++) stamp(ri(130), ri(90), lv);   // 흩뿌림 — 구역 (5 · 6 열) · (3 · 4 줄) 은 가장자리 말고는 안 밟는다(빈 구역)
      for (let t = 0; t < 200; t++) look(ri(130), ri(90), lr);   // 게으른 감쇠 · 1 밑이면 지움
      // 날 넘김 — 얼린 순간 칸 전수가 그날 경계 값
      const dk = [...today]; today = new Set();   // 얼릴 키 어림(하네스가 그날 만진 칸) — 얼린 구역 · 얼린 키 · 그 구역의 다른 칸을 고른다
      DAY = day + 1; R.dayTick();
      const Bv = cellsOf(), Bset = new Map(Bv.map((x) => [x[0], x]));
      // 얼린 뒤(첫 묶음 전) — 얼린 키 · 얼린 구역의 다른 칸 · 새 칸(그 구역) · 닳아 지울 칸 · 먼 칸
      const frozenCh = new Set(dk.map((k) => ck(k % W, (k / W) | 0)));
      for (let t = 0; t < 40 && dk.length; t++) { const k = dk[ri(dk.length)]; stamp(k % W, (k / W) | 0, lv); }
      const dkS = new Set(dk), other = Bv.filter((x) => frozenCh.has(ck(x[0] % W, (x[0] / W) | 0)) && !dkS.has(x[0]));
      for (let t = 0; t < 40 && other.length; t++) { const k = other[ri(other.length)][0]; stamp(k % W, (k / W) | 0, lv); }
      const chs = [...frozenCh];
      for (let t = 0; t < 30 && chs.length; t++) { const c = chs[ri(chs.length)], gx = c % GWn, gy = (c / GWn) | 0, x = gx * GC + ri(GC), y = gy * GC + ri(GC); if (x < W && y < H && !Bset.has(y * W + x)) stamp(x, y, lv); }
      const ones = Bv.filter((x) => x[1] < 1.2 && x[2] < day + 1 + DOFF && frozenCh.has(ck(x[0] % W, (x[0] / W) | 0)));
      for (let t = 0; t < 40 && ones.length; t++) { const k = ones[ri(ones.length)][0]; look(k % W, (k / W) | 0, lr); }
      for (let t = 0; t < 20; t++) stamp(150 + ri(40), 100 + ri(30), lv);   // 먼 칸(얼린 구역 밖일 수 있다)
      // 틱 — 묶음(조각 예산 1ms) · 처음 세 틱 뒤 몇 칸 더(얼린 구역 안 — 묶음이 그새 끝났어도 같은 판: 틱 수는 벽시계라 판에 안 싣는다)
      const ends = () => logs.slice(nLog).filter((l) => / 답압 길 day /.test(l)).length;
      const pending = () => { const p = R.roadDayPerf(); return p ? p.flPending : !ends(); };   // 묶음 · `S.sent` 고침이 남았나(실패한 날은 끝 줄 없이 끝난다)
      let ticks = 0;
      for (let q = 0; q < 3; q++) {
        R.onGameTick(0); ticks++;
        for (let t = 0; t < 15 && chs.length; t++) { const c = chs[ri(chs.length)], gx = c % GWn, gy = (c / GWn) | 0, x = gx * GC + ri(GC), y = gy * GC + ri(GC); if (x < W && y < H) stamp(x, y, lv); }
      }
      while (dk.length && pending() && ticks < 50000) { R.onGameTick(0); ticks++; }
      for (let t = 0; t < 4; t++) R.onGameTick(0);   // ★[T713] `S.sent` 고침 남은 몫
      const dbv = dbCells();
      if (process.env.T1448H_DEBUGDB && hash(dbv) !== hash(Bv)) { const m = new Map(dbv.map((x) => [x[0], x])), dif = []; for (const x of Bv) { const y = m.get(x[0]); if (!y || y[1] !== x[1] || y[2] !== x[2]) dif.push([x, y || null]); } for (const y of dbv) if (!Bset.has(y[0])) dif.push([null, y]); (out.dbg || (out.dbg = [])).push({ day, n: dif.length, ex: dif.slice(0, 6) }); }
      const cr = R.clientRoads() || [];
      const GW = Math.ceil(W / 32), GH = Math.ceil(H / 32);
      const boxAll = R.clientRoadsBox ? R.clientRoadsBox(0, 0, GW - 1, GH - 1) : null, boxSub = R.clientRoadsBox ? R.clientRoadsBox(1, 0, 2, 1) : null;
      const sub = tri(cr).filter((x) => x[0] >= 32 && x[0] < 96 && x[1] < 64);
      const chg = R.takeCoarseChanges();
      const fv = R.frozenView();
      out.days.push({
        day, ticks, dirty: dk.length, end: ends(),
        B: hash(Bv), dbEqB: hash(dbv) === hash(Bv), dbN: dbv.length, BN: Bv.length,
        cells: hash(cellsOf()), n: S.cells.size, lv: hash(lv), lr: hash(lr),
        coarse: hash([...S.coarse].sort((a, b) => a[0] - b[0])), gen: S.coarseGen, graded: S.stats.graded,
        paved: hash([...S.paved].sort((a, b) => a - b)), pavedRaw: hash(R.pavedKeys()), pavedN: S.paved.size,
        client: hash(sortTri(cr)), clientRaw: hash(cr), clientN: cr.length / 3,
        box: boxAll ? hash(sortTri(boxAll)) === hash(sortTri(cr)) && hash(sortTri(boxSub)) === hash(sub.sort((x, y) => (x[1] - y[1]) || (x[0] - y[0]))) : null,
        bc: hash(BC.slice(nb)), bcSet: hash(BC.slice(nb).flatMap((m) => sortTri(JSON.parse(m).cells))), bcN: BC.length - nb,
        soon: hash(R.unpaveSoonKeys()), soonSet: hash([...R.unpaveSoonKeys()].sort((a, b) => a - b)), chg: hash(chg), chgSet: hash([...chg].sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]))),
        cost: [R.courseCostMinIn(0, 0, 10, 10), R.courseCostMinIn(10, 0, 20, 30), R.courseCostMinIn(-5, -5, 80, 80), R.courseCostMul(16, 8), R.courseCostMul(8, 7), fv.size, fv.courseCostMinIn(10, 0, 20, 30), fv.courseCostMul(16, 8), fv.courseCostMin()],
        perf: (() => { const p = R.roadDayPerf(); return p ? [p.lvl, p.sched, p.dueDays] : null; })(),
        fb: (() => { const p = R.roadDayPerf(); return p ? [p.flBatches, p.flSnap] : null; })(),   // 묶음 · 쓰기 전 복사 누계(벽시계라 판에 안 싣는다)
        mem: R.t1448Mem ? R.t1448Mem() : null,
      });
    }
    out.touched = [...touched].sort((a, b) => a - b);
    out.mem = R.t1448Mem ? R.t1448Mem() : null;
    out.end = state(); out.rows = dbRows();
    if (S.cells.ch) out.chunksNull = S.cells.ch.reduce((n, c) => n + (c ? 0 : 1), 0);
    if (process.env.T1448H_DUMP) fs.writeFileSync(process.env.T1448H_DUMP, J(Object.assign(R.t1382Dump(), { _h: { today: [...today] } })));   // `_h` = 하네스 판 상태(길 모듈은 안 읽는다)
    try { DB.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch (e) { }
    out.log = logs.filter((l) => /T1448|실패/.test(l)).slice(0, 12);
    console.log = l0; console.error = e0;
  } catch (e) { out.err = String(e && e.stack || e).slice(0, 900); out.log = logs.slice(-12); }
  process.stdout.write('@@T1448H ' + J(out) + '\n');
  process.exit(0);
}

// ══ 어미 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
function ok(c, name, info) { if (c) { pass++; console.log(`  ✅ ${name}`); } else { fail++; console.log(`  ❌ ${name}${info !== undefined ? ' — ' + String(info).slice(0, 600) : ''}`); } }
const WD = fs.mkdtempSync(path.join(os.tmpdir(), 't1448h-'));
const clean = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const copyDb = (a, b) => { clean(b); fs.copyFileSync(a, b); for (const s of ['-wal']) { try { fs.copyFileSync(a + s, b + s); } catch (e) {} } return b; };
function child(name, env) {
  const e = Object.assign({}, process.env, { T1448H_CHILD: name }, env);
  for (const k of ['T1448_ROAD_GRID', 'T688_ROAD_DAY', 'T713_FLUSH_END']) if (!(k in env)) delete e[k];
  if (!env.T1448H_MUT) delete e.T1448H_MUT;
  const r = spawnSync(process.execPath, ['--no-warnings', __filename], { cwd: ROOT, env: e, encoding: 'utf8', timeout: 300000, maxBuffer: 256 << 20 });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@T1448H '));
  return line ? JSON.parse(line.slice(9)) : { err: 'no output · ' + String(r.stderr || '').slice(-600), days: [] };
}
const F_DAY = ['B', 'dbEqB', 'cells', 'n', 'lv', 'lr', 'coarse', 'gen', 'graded', 'paved', 'pavedN', 'client', 'clientN', 'box', 'bc', 'bcN', 'soonSet', 'chgSet', 'cost', 'perf'];   // 차례만 갈리는 자리(welcome · pavedKeys · 내일 풀릴 칸 · 바뀐 코스 칸)는 모음으로 · 차례는 따로 센다
function diffDays(A, B, fields) {
  const bad = [];
  const n = Math.max(A.days.length, B.days.length);
  for (let i = 0; i < n; i++) {
    const a = A.days[i], b = B.days[i];
    if (!a || !b) { bad.push(`날 ${i} 없음`); continue; }
    for (const f of fields) if (J(a[f]) !== J(b[f])) bad.push(`날 ${a.day} ${f}: ${J(a[f])} ≠ ${J(b[f])}`);
  }
  return bad;
}
const orderDays = (A, B, f) => A.days.filter((a, i) => B.days[i] && a[f] !== B.days[i][f]).length;

console.log('\n=== T1448 — 길 장부 칸 배열(끔 = 종전 Map · Set · 칸 행 · 켬 = 구역 배열 · 구역 행) ===');

// ① 그릇
console.log('\n① 그릇(road-grid) — Map · Set 과 같은 답');
ok(!!RGC, '칸 배열 그릇 모듈(`server/road-grid.js`)이 있다');
if (RGC) {
  const RG = RGC;
  const rng = mulberry32(1448), ri = (n) => (rng() * n) | 0;
  const G = new RG.CellGrid(W, H), M = new Map(), U = new RG.U8Map(W, H), UM = new Map(), BS = new RG.BitSet(W, H), SS = new Set();
  const odd = [1, 1 + 2 ** -52, 119.99999999999999, 0.1 + 0.2, 28 * Math.pow(0.995, 37), 7.999999999999999, 120];
  for (let t = 0; t < 20000; t++) {
    const k = rng() < 0.15 ? [0, W - 1, (H - 1) * W, W * H - 1, 31, 32, 31 * W + 31, 32 * W + 32, 95 * W + 191, 128 * W + 192][ri(10)] : ri(W * H);
    const op = rng();
    if (op < 0.55) { const o = { v: odd[ri(odd.length)] * (1 + ri(3)), d: ri(900) }; G.set(k, o); M.set(k, { v: o.v, d: o.d }); }
    else if (op < 0.75) { G.delete(k); M.delete(k); }
    else if (op < 0.85) { const r = G.get(k), m = M.get(k); if (r && m) { r.v *= 0.995; r.d += 1; m.v *= 0.995; m.d += 1; } }
    else { const x = 1 + ri(2); U.set(k, x); UM.set(k, x); if (rng() < 0.4) { U.delete(k); UM.delete(k); } if (rng() < 0.5) { BS.add(k); SS.add(k); } else { BS.delete(k); SS.delete(k); } }
  }
  const mk = [...M.keys()].sort((a, b) => a - b), gk = [...G.keys()];
  let hasOk = true; for (let t = 0; t < 4000; t++) { const k = ri(W * H); if (G.has(k) !== M.has(k) || (G.get(k) === undefined) !== (M.get(k) === undefined)) hasOk = false; }
  ok(G.size === M.size && J(gk) === J(mk) && hasOk && mk.every((k) => G.has(k) && G.get(k).v === M.get(k).v && G.get(k).d === M.get(k).d),
    '칸 값 그릇 = Map(크기 · 있음 · 값 · 날 · 칸 키 오름 차례 · 구역 경계 · 존 가장자리)', J({ g: G.size, m: M.size, hasOk }));
  ok(J([...G].map(([k, r]) => [k, r.v, r.d])) === J(mk.map((k) => [k, M.get(k).v, M.get(k).d])), '도는 차례 = 칸 키 오름(entries · 값 그대로)');
  { const a = []; G.scan((k, v, d) => a.push([k, v, d])); const b = []; U.scan((k, x) => b.push([k, x])); const c = []; BS.scan((k) => c.push(k));
    ok(J(a) === J([...G].map(([k, r]) => [k, r.v, r.d])) && J(b) === J([...U]) && J(c) === J([...BS]), '빠른 훑기(`scan` — 웰컴 · 부팅 · 코스 재구축이 쓴다) = 도는 차례 그대로(셋 다)'); }
  const uk = [...UM.keys()].sort((a, b) => a - b), sk = [...SS].sort((a, b) => a - b);
  ok(U.size === UM.size && J([...U]) === J(uk.map((k) => [k, UM.get(k)])) && BS.size === SS.size && J([...BS]) === J(sk) && sk.every((k) => BS.has(k)),
    '등급 그릇 = Map · 다진 길 그릇 = Set(키 오름 차례)', J({ u: [U.size, UM.size], b: [BS.size, SS.size] }));
  let rt = true;
  for (const ci of G.chunkKeys()) { const p = G.packChunk(ci), q = RG.decodeChunk(RG.encodeChunk(p)); if (q.n !== p.n || [...q.li].some((x, j) => x !== p.li[j]) || [...q.v].some((x, j) => !Object.is(x, p.v[j])) || [...q.d].some((x, j) => x !== p.d[j])) rt = false; }
  const G2 = new RG.CellGrid(W, H); for (const ci of G.chunkKeys()) { const q = RG.decodeChunk(RG.encodeChunk(G.packChunk(ci))); G2.unpackChunk(ci, q.li, q.v, q.d); }
  ok(rt && J([...G2].map(([k, r]) => [k, r.v, r.d])) === J([...G].map(([k, r]) => [k, r.v, r.d])), '덩이 글 꼴 → 되읽기 = 값 그대로(Float64 끝자리까지 · 칸 자리 · 날)');
  { // T688 문턱 날(I32Map) · 날 통(DueList) · 코스 지도(DenseU8) — Map · Set 뜻 그대로
    const SC = new RG.DayMap(W, H), SM = new Map(), DU = new Map(), DM = new Map();
    const due = (d) => { let a = DU.get(d); if (!a) DU.set(d, a = new RG.DueList(SC, d)); return a; }, dm = (d) => { let a = DM.get(d); if (!a) DM.set(d, a = new Set()); return a; };
    for (let t = 0; t < 30000; t++) {
      const k = ri(W * H) % 3000, nd = 1 + ri(40), od = SM.get(k);
      if (rng() < 0.15) { if (od !== undefined) { DU.get(od).delete(k); DM.get(od).delete(k); SC.delete(k); SM.delete(k); } continue; }   // 등급 0 으로(문턱 날 지움)
      if (od === nd) continue;
      if (od !== undefined) { DU.get(od).delete(k); DM.get(od).delete(k); }
      SC.set(k, nd); SM.set(k, nd); due(nd).add(k); dm(nd).add(k);
    }
    let dueOk = true, sizeOk = true;
    for (const [d, S2] of DM) { const L = DU.get(d), got = [...L]; if (J([...new Set(got)].sort((a, b) => a - b)) !== J([...S2].sort((a, b) => a - b)) || got.length !== S2.size) dueOk = false; if (L.size !== S2.size) sizeOk = false; }
    const CO = new RG.DenseU8(50, 35), CM = new Map(); for (let t = 0; t < 3000; t++) { const k = ri(50 * 35), x = ri(3); CO.set(k, x); if (x) CM.set(k, x); else CM.delete(k); }
    const COST = [1, 0.93, 0.87]; let minOk = true;
    for (let t = 0; t < 200; t++) { const x0 = ri(60) - 5, y0 = ri(45) - 5, x1 = x0 + ri(30), y1 = y0 + ri(20); let m = 1; for (const [k, lv] of CM) { const x = k % 50, y = (k / 50) | 0; if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && COST[lv] < m) m = COST[lv]; } if (CO.minIn(COST, x0, y0, x1, y1) !== m) minOk = false; }
    ok(SC.size === SM.size && J([...SC]) === J([...SM].sort((a, b) => a[0] - b[0])) && dueOk && sizeOk && CO.size === CM.size && J([...CO]) === J([...CM].sort((a, b) => a[0] - b[0])) && minOk && J([...CO.copy()]) === J([...CO]),
      'T688 문턱 날 · 날 통(다시 잡힌 칸 거름 · 같은 칸 하나) · 코스 지도(상자 안 최저 할인 · 얼린 사본) = Map · Set 과 같은 모음 · 같은 셈', J({ sc: [SC.size, SM.size], dueOk, sizeOk, minOk }));
  }
  { // 날 — 큰 날(250ms 판 자의 길 날 71억 · 맞춤 몫) · 폭이 Int32 를 넘는 날 · 정수가 아닌 날 = 적은 날 그대로(그릇 · 덩이 글)
    const big = 7173017989, A1 = new RG.CellGrid(W, H), A2 = new RG.CellGrid(W, H), M1 = new Map(), M2 = new Map();
    for (let t = 0; t < 3000; t++) { const k = ri(W * H), o = { v: 1 + ri(100) * 1.1, d: big + ri(900) }; A1.set(k, o); M1.set(k, { v: o.v, d: o.d }); }
    const r0 = A1.get([...M1.keys()][0]); r0.d = r0.d + 5; M1.get([...M1.keys()][0]).d += 5;   // 손잡이로 고친 날(CellRef)
    const f1 = A1.d64;
    for (let t = 0; t < 2000; t++) { const k = ri(W * H), o = { v: 1 + ri(50), d: t < 1000 ? big + ri(900) : (t < 1500 ? ri(900) : 12.5 + ri(9)) }; A2.set(k, o); M2.set(k, { v: o.v, d: o.d }); }
    const same = (G, M) => J([...G].map(([k, r]) => [k, r.v, r.d])) === J([...M].sort((a, b) => a[0] - b[0]).map(([k, r]) => [k, r.v, r.d]));
    const rtrip = (G) => { const G2 = new RG.CellGrid(W, H); for (const ci of G.chunkKeys()) { const q = RG.decodeChunk(RG.encodeChunk(G.packChunk(ci))); G2.unpackChunk(ci, q.li, q.v, q.d); } return J([...G2].map(([k, r]) => [k, r.v, r.d])) === J([...G].map(([k, r]) => [k, r.v, r.d])); };
    ok(same(A1, M1) && !f1 && same(A2, M2) && A2.d64 && rtrip(A1) && rtrip(A2) && A1.mem() === A1.nCh * CHB,
      '날 = 적은 날 그대로 — 큰 날(71억 · 맞춤 몫)은 밑 날 차 Int32(구역 바이트 그대로) · 폭이 Int32 를 넘거나 정수가 아닌 날이 오면 그릇이 Float64 로 · 덩이 글 되읽기도', J({ f1, f2: A2.d64 }));
  }
  const E = new RG.CellGrid(W, H); E.set(5 * W + 5, { v: 1, d: 0 });
  ok(E.nCh === 1 && E.ch.filter(Boolean).length === 1 && E.mem() === CHB, `빈 구역은 배열 0 — 한 칸 밟으면 그 구역 하나(${GC} × ${GC}칸 · ${CHB.toLocaleString()} 바이트)`, J({ nCh: E.nCh, mem: E.mem() }));
}

// ② ③ ⑥ 끔 ↔ 켬 60날
const DBOFF = path.join(WD, 'off.db'), DBON = path.join(WD, 'on.db');
const OFF = child('run', { T1448H_DB: DBOFF, T1448H_D0: '0', T1448H_D1: '60' });
const ON = child('run', { T1448H_DB: DBON, T1448H_D0: '0', T1448H_D1: '60', T1448_ROAD_GRID: '1', T1448H_DUMP: path.join(WD, 'on60.json') });
console.log('\n② 끔 ↔ 켬 — 같은 세계 60날');
{
  ok(!OFF.err && !ON.err && OFF.t1448 === false && ON.t1448 === true && OFF.days.length === 60 && ON.days.length === 60, '[상황] 두 판이 60날 돈다(끔 = 종전 장부 · 켬 = 배열 장부)', J(OFF.err || ON.err));
  const last = ON.days[59] || {}, mid = ON.days[30] || {};
  const multi = ON.days.filter((d, i) => i && d.fb && ON.days[i - 1].fb && d.fb[0] - ON.days[i - 1].fb[0] > 1).length, snaps = last.fb ? last.fb[1] : 0;
  ok(last.n > 2000 && last.pavedN > 50 && last.clientN > 300 && ON.days.some((d) => d.gen > 0) && ON.days.reduce((s, d) => s + d.bcN, 0) > 10 && multi > 10 && snaps > 1000,
    '[상황] 판이 장부를 다 쓴다(칸 · 다진 길 · 등급 칸 · 코스 오름 · 방송 · 하루 저장이 여러 묶음 · 쓰기 전 복사)', J({ n: last.n, paved: last.pavedN, client: last.clientN, multi, snaps, mid: mid.pavedN }));
  const bad = diffDays(OFF, ON, F_DAY);
  ok(!bad.length, '날마다 칸 전수(키 · 값 · 날) · 등급 줄 · 코스 지도 · 오름 · 다진 길 · welcome 모음 · 보이는 구역 문 · 방송(차례까지) · 내일 풀릴 칸 · 바뀐 코스 칸 · 할인 · T688 표 — 같음', bad.slice(0, 6).join(' · '));
  const oc = orderDays(OFF, ON, 'clientRaw'), op = orderDays(OFF, ON, 'pavedRaw'), os_ = orderDays(OFF, ON, 'soon'), og = orderDays(OFF, ON, 'chg');
  ok(ON.days.every((d) => d.box === true) && OFF.days.every((d) => d.box === true), '보이는 구역만 문(`clientRoadsBox`) = 그 상자 안 welcome 칸(존 전부 · 구역 둘 · 끔 · 켬)');
  ok(oc > 0, `[차례 표] 모음은 같고 차례만 갈린 날 — welcome 나열 ${oc}/60 · pavedKeys ${op}/60 · 내일 풀릴 칸 ${os_}/60 · 바뀐 코스 칸 ${og}/60(켬 = 칸 키 오름 · 날 통 첫 자리 — 이 자가 차례 차이를 본다)`, J({ oc, op, os_, og }));
}
console.log('\n③ 저장 — 날마다 DB = 그날 경계 값');
{
  const offOk = OFF.days.every((d) => d.dbEqB), onOk = ON.days.every((d) => d.dbEqB);
  ok(offOk && onOk && ON.rows.cell === 0 && ON.rows.chunk > 0 && !OFF.rows.chunkTab, '끔(칸 행) · 켬(구역 행) 모두 날마다 DB 되읽기 = 얼린 순간 칸 전수(얼린 뒤 바뀐 칸 · 새 칸 · 지운 칸 섞임) · 끔 DB 엔 구역 표가 없다',
    J({ offBad: OFF.days.filter((d) => !d.dbEqB).map((d) => d.day).slice(0, 5), onBad: ON.days.filter((d) => !d.dbEqB).map((d) => d.day).slice(0, 5), rows: ON.rows, offRows: OFF.rows }));
}
{
  const FA = child('run', { T1448H_DB: path.join(WD, 'fail-on.db'), T1448H_D0: '0', T1448H_D1: '20', T1448_ROAD_GRID: '1', T1448H_FAILDAY: '10' });
  const FB = child('run', { T1448H_DB: path.join(WD, 'fail-off.db'), T1448H_D0: '0', T1448H_D1: '20', T1448H_FAILDAY: '10' });
  const ok1 = (X) => X.failed === 11 && X.days[10] && X.days[10].end === 0 && X.days[10].bcN === 0 && X.days.slice(11).every((d) => d.dbEqB && d.end === 1) && X.days.slice(0, 10).every((d) => d.dbEqB);
  const stale = (X) => X.days.slice(11).filter((d) => !d.dbEqB).length;
  const same = diffDays({ days: ON.days.slice(0, 20) }, FA, ['cells', 'n', 'lv', 'lr', 'coarse', 'paved', 'graded']);
  const why = (X) => ({ failed: X.failed, d10: X.days[10] && [X.days[10].end, X.days[10].bcN, X.days[10].dbEqB], after: X.days.slice(11).filter((d) => !(d.dbEqB && d.end === 1)).map((d) => [d.day, d.dbEqB, d.end]).slice(0, 3), before: X.days.slice(0, 10).filter((d) => !d.dbEqB).map((d) => d.day) });
  ok(!FA.err && !FB.err && ok1(FA) && FB.failed === 11 && FB.days[10] && FB.days[10].end === 0 && !same.length,
    '켬 묶음 실패(날 10 을 닫는 저장 셋째 쓰기) — 그날 끝 없음(방송 0) · 다음 날 저장이 DB 를 그날 경계 값으로 되돌린다 · 세계 값 = 실패 없는 판', same[0] || J({ fa: why(FA), fb: why(FB), err: FA.err || FB.err }));
  ok(true, `[표 · 종전 갈래] 끔 묶음 실패 — 던진 그 키 하나가 다음 날 다시 안 쓰여 DB 가 경계 값과 다른 날 ${stale(FB)}/9(그 칸이 다시 바뀌는 날까지) · 켬 ${stale(FA)}/9 — 회부`);
}
console.log('\n⑥ 메모리 — 밟힌 구역만');
{
  const m = ON.mem || {};
  ok(m.chunks === ON.touched.length && m.cells === ON.touched.length * CHB && ON.chunksNull === GWn * GHn - ON.touched.length && ON.touched.length < GWn * GHn,
    `배열이 선 구역 = 밟힌 구역 ${ON.touched.length}/${GWn * GHn}(빈 구역 배열 0) · 값 · 날 배열 = 구역 × ${CHB.toLocaleString()} 바이트`, J({ mem: m, touched: ON.touched.length, nulls: ON.chunksNull }));
}

// ④ 부팅 · 이관
console.log('\n④ 부팅 — 옛 DB 이관 한 거래 · 되돌림 · 이관 중 죽음 · 이관 도구');
{
  const base = DBOFF;   // 끔 판 60날 DB(칸 행 — 옛 꼴)
  const c0 = copyDb(base, path.join(WD, 'b0.db')), c1 = copyDb(base, path.join(WD, 'b1.db')), c2 = copyDb(base, path.join(WD, 'b2.db'));
  const B0 = child('boot', { T1448H_DB: c0, T1448H_D0: '75', T1448H_D1: '75' });
  const B1 = child('boot', { T1448H_DB: c1, T1448H_D0: '75', T1448H_D1: '75', T1448_ROAD_GRID: '1' });
  const fwOut = path.join(WD, 'fw.db'); clean(fwOut);
  execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, 't1448-road-migrate.js'), '--forward', base, '--out', fwOut, '--cells-w', String(W), '--cells-h', String(H)], { cwd: ROOT, stdio: 'ignore' });
  const B2 = child('boot', { T1448H_DB: c1, T1448H_D0: '75', T1448H_D1: '75', T1448_ROAD_GRID: '1' });
  const bkOut = path.join(WD, 'bk.db'); clean(bkOut);
  execFileSync(process.execPath, ['--no-warnings', path.join(__dirname, 't1448-road-migrate.js'), '--back', c1, '--out', bkOut, '--cells-w', String(W), '--cells-h', String(H)], { cwd: ROOT, stdio: 'ignore' });
  const B3 = child('boot', { T1448H_DB: c1, T1448H_D0: '75', T1448H_D1: '75' });
  const BF = child('boot', { T1448H_DB: c2, T1448H_D0: '75', T1448H_D1: '75', T1448_ROAD_GRID: '1', T1448H_FAILAT: '3' });
  const BF2 = child('boot', { T1448H_DB: c2, T1448H_D0: '75', T1448H_D1: '75', T1448_ROAD_GRID: '1' });
  const FWr = child('boot', { T1448H_DB: fwOut, T1448H_D0: '75', T1448H_D1: '75', T1448_ROAD_GRID: '1' });
  const BKr = child('boot', { T1448H_DB: bkOut, T1448H_D0: '75', T1448H_D1: '75' });
  const s = (x) => J(x && x.boot0 && x.boot0.state);
  const r0 = B0.boot0 && B0.boot0.rows, r1 = B1.boot0 && B1.boot0.rows;
  ok(!B0.err && !B1.err && B0.boot0.state.n > 1000 && B0.boot0.state.bootUnN > 0, '[상황] 옛 DB(칸 행) · 15날 꺼졌다 뜬 부팅 — 꺼진 사이 풀린 다진 길이 있다', J(B0.err || B1.err || B0.boot0.state));
  ok(s(B0) === s(B1), '켬 부팅(이관) 장부 = 끔 부팅 장부(칸 전수 · 코스 · 다진 길 · 부팅 풀림 줄 차례 · T688 표)', J([B0.boot0.state, B1.boot0.state]));
  ok(r1 && r1.cell === 0 && r1.chunk === B0.boot0.state.chunks && r1.chunk > 0 && B1.boot && B1.boot.mig && B1.boot.mig.cellRows === r0.cell && B1.boot.mig.chunkRows === r1.chunk && B1.boot0.log.some((l) => /칸 행 \d+ → 구역 행 \d+\(한 거래/.test(l)),
    '이관 = 한 거래 — 칸 행 0 · 구역 행 = 칸 있는 구역 수 · 로그 한 줄', J({ r0, r1, mig: B1.boot && B1.boot.mig }));
  ok(s(B2) === s(B0) && B2.boot && !B2.boot.mig && B2.boot0.rows.chunkH === r1.chunkH, '다시 켬 부팅 = 같은 장부 · 쓰기 0(구역 행 글자 그대로)', J({ boot: B2.boot, h: [B2.boot0.rows.chunkH, r1.chunkH] }));
  ok(s(B3) === s(B0) && B3.boot0.rows.cell === r0.cell && B3.boot0.rows.cellH === r0.cellH && B3.boot0.rows.chunk === 0 && B3.boot0.log.some((l) => /손잡이 끔 — 구역 행 \d+ → 칸 행/.test(l)),
    '켰던 DB 끔 부팅 = 되돌림(칸 행 = 처음 칸 행 그대로 · 구역 행 0) · 같은 장부', J({ rows: B3.boot0.rows, r0 }));
  ok(!BF.err && s(BF) === s(B0) && BF.boot0.rows.cell === r0.cell && BF.boot0.rows.cellH === r0.cellH && BF.boot0.rows.chunk === 0 && BF.boot.mig && BF.boot.mig.err && s(BF2) === s(B0) && BF2.boot0.rows.cell === 0 && BF2.boot0.rows.chunkH === r1.chunkH,
    '이관 중 죽음(셋째 구역 행에서) = DB 앞 그대로(칸 행 그대로 · 구역 행 0 · 장부는 산다) → 다음 부팅이 이관(같은 구역 행)', J({ bf: BF.boot0 && BF.boot0.rows, mig: BF.boot && BF.boot.mig, bf2: BF2.boot0 && BF2.boot0.rows }));
  ok(FWr.boot0 && FWr.boot0.rows.chunkH === r1.chunkH && s(FWr) === s(B0) && BKr.boot0 && BKr.boot0.rows.cellH === r0.cellH && s(BKr) === s(B0),
    '이관 도구 `--forward` 구역 행 = 부팅 이관 구역 행(덩이 글자까지) · `--back` 칸 행 = 처음 칸 행 · 둘 다 같은 장부로 뜬다', J({ fw: FWr.boot0 && FWr.boot0.rows, bk: BKr.boot0 && BKr.boot0.rows }));
}

// ⑤ 다시 뜬 판
console.log('\n⑤ 다시 뜬 판(존 종료 저장 덤프) — 30날 더');
{
  const REF_ON = child('run', { T1448H_DB: path.join(WD, 'ref-on.db'), T1448H_D0: '0', T1448H_D1: '90', T1448_ROAD_GRID: '1' });
  const REF_OFF = child('run', { T1448H_DB: path.join(WD, 'ref-off.db'), T1448H_D0: '0', T1448H_D1: '90' });
  const OFFD = child('run', { T1448H_DB: path.join(WD, 'offd.db'), T1448H_D0: '0', T1448H_D1: '60', T1448H_DUMP: path.join(WD, 'off60.json') });
  const rOnOn = child('run', { T1448H_DB: copyDb(DBON, path.join(WD, 'r1.db')), T1448H_D0: '60', T1448H_D1: '90', T1448_ROAD_GRID: '1', T1448H_LOAD: path.join(WD, 'on60.json') });
  const rOnOff = child('run', { T1448H_DB: copyDb(DBON, path.join(WD, 'r2.db')), T1448H_D0: '60', T1448H_D1: '90', T1448H_LOAD: path.join(WD, 'on60.json') });
  const rOffOn = child('run', { T1448H_DB: copyDb(path.join(WD, 'offd.db'), path.join(WD, 'r3.db')), T1448H_D0: '60', T1448H_D1: '90', T1448_ROAD_GRID: '1', T1448H_LOAD: path.join(WD, 'off60.json') });
  const tail = (X) => ({ days: X.days.slice(60) });
  const FV = ['cells', 'n', 'lv', 'lr', 'coarse', 'gen', 'graded', 'paved', 'pavedN', 'client', 'clientN', 'soonSet', 'cost', 'perf', 'dbEqB'];
  const refBad = diffDays(tail(REF_OFF), tail(REF_ON), FV);
  ok(!REF_ON.err && !REF_OFF.err && !refBad.length && REF_ON.days.length === 90, '[상황] 끊김 없는 판 90날 — 끔 = 켬(61 ~ 90날)', refBad.slice(0, 4).join(' · ') || J(REF_ON.err || REF_OFF.err));
  const b1 = diffDays(tail(REF_ON), rOnOn, FV), b2 = diffDays(tail(REF_ON), rOnOff, FV), b3 = diffDays(tail(REF_ON), rOffOn, FV);
  ok(rOnOn.loaded === true && !b1.length, '켬 덤프 → 켬 되올림 30날 = 끊김 없는 판(칸 · 등급 줄 · 지도 · 다진 길 · 표 · 저장)', b1.slice(0, 4).join(' · ') || J(rOnOn.err));
  ok(rOnOff.loaded === true && !b2.length, '켬 덤프 → 끔 되올림 30날 = 끊김 없는 판(구역 덩이를 Map 으로 · DB 는 되돌림)', b2.slice(0, 4).join(' · ') || J(rOnOff.err));
  ok(rOffOn.loaded === true && !b3.length, '끔 덤프 → 켬 되올림 30날 = 끊김 없는 판(칸 줄을 배열로 · DB 는 이관)', b3.slice(0, 4).join(' · ') || J(rOffOn.err));
}

// ②″ 큰 날(250ms 판 자 — 길 날 = 벽시계 날 71억)
console.log('\n②″ 큰 날(길 날 71억 — 250ms 판 자 꼴) — 끔 ↔ 켬 20날');
{
  const A = child('run', { T1448H_DB: path.join(WD, 'big-a.db'), T1448H_D0: '0', T1448H_D1: '20', T1448H_DOFF: '7173017989' });
  const B = child('run', { T1448H_DB: path.join(WD, 'big-b.db'), T1448H_D0: '0', T1448H_D1: '20', T1448H_DOFF: '7173017989', T1448_ROAD_GRID: '1' });
  const bad = diffDays(A, B, F_DAY.filter((f) => f !== 'dbEqB'));
  ok(!A.err && !B.err && A.days.length === 20 && !bad.length && B.days.every((d) => d.dbEqB), '큰 날에서도 칸 전수 · 등급 · 지도 · 방송 같음 · 켬 구역 행 = 경계 값(날 그대로)', bad.slice(0, 3).join(' · ') || J(A.err || B.err));
  ok(true, `[표] 끔 칸 행은 큰 날을 \`d | 0\` 로 접어 적는다(종전 글자 · 경계 값과 같은 날 ${A.days.filter((d) => d.dbEqB).length}/20) — 켬 구역 행은 날 그대로(되읽어 다시 떠도 감쇠가 맞다)`);
}

// ②′ T688 끈 판
console.log('\n②′ T688 끈 판(종전 전수 재구축) — 끔 ↔ 켬 30날');
{
  const A = child('run', { T1448H_DB: path.join(WD, 't688a.db'), T1448H_D0: '0', T1448H_D1: '30', T688_ROAD_DAY: '0' });
  const B = child('run', { T1448H_DB: path.join(WD, 't688b.db'), T1448H_D0: '0', T1448H_D1: '30', T688_ROAD_DAY: '0', T1448_ROAD_GRID: '1' });
  const bad = diffDays(A, B, F_DAY.filter((f) => f !== 'chg' && f !== 'perf').concat(['chgSet']));
  ok(!A.err && !B.err && A.days.length === 30 && !bad.length, 'T688 끔에서도 값 · 지도 · 다진 길 · 방송 · 저장 같음(바뀐 코스 칸은 모음으로)', bad.slice(0, 4).join(' · ') || J(A.err || B.err));
  const oc = orderDays(A, B, 'chg');
  ok(true, `[차례 표] T688 끈 판 — 바뀐 코스 칸 줄 차례가 갈린 날 ${oc}/30(교역로 다시 파기는 모음으로 거른다 — villages \`_t619RedigKeep\`)`);
}

// ⑦ 미끼
console.log('\n⑦ 미끼 — 한 자리만 바꾼 사본');
{
  const run = (mut, d1, extra) => child('run', Object.assign({ T1448H_DB: path.join(WD, `m-${mut}.db`), T1448H_D0: '0', T1448H_D1: String(d1), T1448_ROAD_GRID: '1', T1448H_MUT: mut }, extra || {}));
  const off20 = { days: OFF.days.slice(0, 20) };
  { const n = siteN('f32'), R = run('f32', 20), bad = diffDays(off20, R, ['cells']);
    ok(n === 1 && !R.err && bad.length > 0, `★미끼 f32 — 값을 32비트로 담는 사본 → ② "칸 전수 같음" 빨강(바꾼 자리 ${n})`, bad[0] || J(R.err)); }
  { const n = siteN('dead'), R = run('dead', 20), bad = diffDays(off20, R, ['cells', 'n', 'lv']);
    ok(n === 1 && !R.err && bad.length > 0, `★미끼 dead — 다 닳은 칸을 0 으로 안 적는 사본 → ② "칸 · 등급 줄 같음" 빨강(바꾼 자리 ${n})`, bad[0] || J(R.err)); }
  { const n = siteN('edge'), R = run('edge', 20), bad = diffDays(off20, R, ['client', 'paved', 'box', 'dbEqB']);
    ok(n === 1 && !R.err && bad.length > 0, `★미끼 edge — 구역 끝 열(15 · 31 · …)을 안 도는 빠른 훑기 사본 → ② "welcome · 다진 길 같음" 빨강(바꾼 자리 ${n})`, bad[0] || J(R.err)); }
  { const n = siteN('prealloc'), R = run('prealloc', 5), m = R.mem || {};
    ok(n === 1 && !R.err && !(m.chunks === R.touched.length && m.cells === R.touched.length * CHB), `★미끼 prealloc — 밟힌 적 없는 구역 배열을 미리 다 만드는 사본 → ⑥ "밟힌 구역만" 빨강(바꾼 자리 ${n})`, J({ mem: m, touched: R.touched && R.touched.length, err: R.err })); }
  { const n = siteN('cow'), R = run('cow', 20);
    ok(n === 1 && !R.err && R.days.some((d) => !d.dbEqB), `★미끼 cow — 구역 행에 얼린 뒤 값을 적는 사본 → ③ "DB = 그날 경계 값" 빨강(바꾼 자리 ${n})`, J({ bad: R.days.filter((d) => !d.dbEqB).length, err: R.err })); }
  { const n = siteN('resume'), R = child('run', { T1448H_DB: copyDb(DBON, path.join(WD, 'm-resume.db')), T1448H_D0: '60', T1448H_D1: '70', T1448_ROAD_GRID: '1', T1448H_LOAD: path.join(WD, 'on60.json'), T1448H_MUT: 'resume' });
    const REF = child('run', { T1448H_DB: copyDb(DBON, path.join(WD, 'm-resume-ref.db')), T1448H_D0: '60', T1448H_D1: '70', T1448_ROAD_GRID: '1', T1448H_LOAD: path.join(WD, 'on60.json') });
    const bad = diffDays(REF, R, ['cells', 'lv']);
    ok(n === 1 && !R.err && !REF.err && bad.length > 0, `★미끼 resume — 되올린 값을 32비트로 담는 사본 → ⑤ "되올림 = 끊김 없는 판" 빨강(바꾼 자리 ${n})`, bad[0] || J(R.err || REF.err)); }
  { const n = siteN('order'), R = run('order', 20), bad = diffDays(off20, R, ['bc']), same = diffDays(off20, R, ['bcSet', 'cells', 'dbEqB']);
    ok(n === 1 && !R.err && bad.length > 0 && same.length === 0, `★미끼 order — 방송 차례를 칸 키 오름으로 바꾼 사본 → ② "방송 차례까지 같음" 빨강 · 방송 모음 · 값 · 저장은 같다(차례만 잡는 자 · 바꾼 자리 ${n})`, J({ bad: bad[0], same: same[0], err: R.err })); }
}

try { for (const f of fs.readdirSync(WD)) fs.unlinkSync(path.join(WD, f)); fs.rmdirSync(WD); } catch (e) { }
console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
process.exit(fail ? 1 : 0);
