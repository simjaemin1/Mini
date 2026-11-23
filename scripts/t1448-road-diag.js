#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1448 재기 · 진단 자 · 제품 무변 · 읽기만)
// === scripts/t1448-road-diag.js — 길 장부(`server/roads.js`)를 라이브 크기 DB 로 띄워 메모리 · 청소 멈춤 · 덤프 · 부팅 · 퍼짐을 잰다 ===
//
// 쓰는 법(아이 판 하나 = 갈래 하나 · 어미가 갈래마다 새 프로세스로 띄워 힙을 깨끗이 잰다):
//   node --experimental-sqlite --expose-gc scripts/t1448-road-diag.js <world.db 사본> <out.json> [--day <길 날>] [--zone hanbando]
//   ★DB 는 사본을 준다 — zone-local-db 가 열며 표 꼴을 맞춘다(쓰기 0 이어도 스키마 줄이 돈다).
//   길 날 = 저장된 `roads.d` 의 가장 큰 값(사본을 뜬 날 — 라이브는 벽시계 날 · epoch 0 · 하루 24분)이 기본 — `setEconDay` 로 그날에 묶어 띄운다(꺼진 사이 감쇠 0).
// 갈래(아이 · env T1448_PROBE):
//   base   모듈만 실은 힙(길 0)
//   full   종전 그대로 init(T688 켬 기본) → 칸 · 다져진 길 · 코스 · T688 표 + `S.sent` 를 첫 하루 마감 뒤처럼 채움(등급 칸 → 등급) → 구조마다 지우며 힙 차
//          · 청소 멈춤(가득 수거 `gc()` 다섯 번 가운데) · 덤프(`t1382Dump` → JSON 글자 크기 · ms) · 되올림(`t1382Load`) ms · `clientRoads()` 크기 · ms
//   noi    T688 끔(`T688_ROAD_DAY=0`) init — T688 표 몫을 차로 본다
//   cells  칸 Map 하나만(같은 꼴 `{v,d}` 객체) — 칸 몫의 바닥
//   grid   어림(본 작업 전 · 시제품 꼴): 32칸 구역마다 값 Float64Array · 날 Int32Array · 색인 Uint8Array(등급 · 방송 등급 · 다져진 길 비트) 1,024칸씩 +
//          코스 지도 Uint8Array(4칸 격자 전체) + 문턱 날 통(날 → 칸 키 배열 · 등급 칸만) — 힙 · ArrayBuffer(힙 밖) · 청소 멈춤
// 어미: 아이 넷을 돌려 한 JSON 으로 + 퍼짐(구역 32 · 64칸마다 칸 수 · 히스토그램 · 배열 총량 후보)을 DB 에서 바로 센다.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const PROBE = process.env.T1448_PROBE || '';
const MB = (b) => Math.round(b / 1048576 * 10) / 10;

if (PROBE) {
  const DB = A[0], ZONE = opt('zone', 'hanbando');
  process.env.DB_PATH = DB; process.env.ZONE_ID = ZONE;
  const gcF = () => { global.gc(); global.gc(); };
  const heap = () => { gcF(); return process.memoryUsage().heapUsed; };
  const out = { probe: PROBE };
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const { ZONES } = quiet(() => require(path.join(ROOT, 'server', 'zone-config')));
  const Z = ZONES[ZONE];
  const cellsW = Math.ceil(Z.zoneWidth / 32), cellsH = Math.ceil(Z.zoneHeight / 32);
  out.cellsW = cellsW; out.cellsH = cellsH;
  const R = quiet(() => require(path.join(ROOT, 'server', 'roads')));
  const LDB = quiet(() => require(path.join(ROOT, 'server', 'zone-local-db')));
  const mx = (() => { const { DatabaseSync } = require('node:sqlite'); const d0 = new DatabaseSync(DB, { readOnly: true }); const r = d0.prepare('SELECT max(d) AS m, count(*) AS n FROM roads').get(); d0.close(); return r; })();
  const day = +opt('day', 0) || (mx.m | 0);
  out.day = day; out.rows = mx.n;
  const h0 = heap(); out.heapBase = MB(h0);   // 모듈만(길 행을 읽기 앞)
  if (PROBE === 'cells') {
    let rows0 = LDB.getRoadCells(ZONE);
    const t0 = Date.now(); const M = new Map(); for (const r of rows0) M.set(r.cell_key | 0, { v: r.v, d: r.d | 0 }); out.buildMs = Date.now() - t0;
    rows0 = null;
    out.cellsMB = MB(heap() - h0); out.n = M.size;
    const g = []; for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); global.gc(); g.push(Number(process.hrtime.bigint() - t) / 1e6); } out.gcMs = g.sort((a, b) => a - b)[2];
    M.clear(); out.cellsGoneMB = MB(heap() - h0);
  } else if (PROBE === 'grid') {
    const C = 32, gw = Math.ceil(cellsW / C), DK = 0.995, T1 = 8, T2 = 28;
    const a0 = process.memoryUsage().arrayBuffers;
    let rows0 = LDB.getRoadCells(ZONE);
    const t0 = Date.now();
    const ch = new Array(gw * Math.ceil(cellsH / C)).fill(null);
    const due = new Map();
    const cg = new Uint8Array(Math.ceil(cellsW / 4) * Math.ceil(cellsH / 4));
    for (const r of rows0) {
      const k = r.cell_key | 0, cx = k % cellsW, cy = (k / cellsW) | 0, ci = ((cy / C) | 0) * gw + ((cx / C) | 0), li = (cy % C) * C + (cx % C);
      let c = ch[ci]; if (!c) c = ch[ci] = { v: new Float64Array(C * C), d: new Int32Array(C * C), f: new Uint8Array(C * C) };
      c.v[li] = r.v; c.d[li] = r.d | 0;
      const v = day > r.d ? r.v * Math.pow(DK, day - r.d) : r.v, lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
      if (lv) { c.f[li] = lv | (lv << 2) | (lv === 2 ? 16 : 0); const gi = ((cy / 4) | 0) * Math.ceil(cellsW / 4) + ((cx / 4) | 0); if (cg[gi] < lv) cg[gi] = lv;
        const T = lv === 2 ? T2 : T1; let n = Math.max(1, Math.floor(Math.log(T / r.v) / Math.log(DK))); const dd = (r.d | 0) + n; let a = due.get(dd); if (!a) due.set(dd, a = []); a.push(k); }
    }
    out.buildMs = Date.now() - t0; rows0 = null;
    const hh = heap(); const ab = process.memoryUsage().arrayBuffers - a0;
    out.gridHeapMB = MB(hh - h0); out.gridBufMB = MB(ab); out.gridMB = MB(hh - h0 + ab);
    out.chunks = ch.filter(Boolean).length; out.dueDays = due.size;
    const g = []; for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); global.gc(); g.push(Number(process.hrtime.bigint() - t) / 1e6); } out.gcMs = g.sort((a, b) => a - b)[2];
    out.keep = ch.length + cg.length + due.size;   // 끝까지 쥔다(수거 앞에 놓치지 않게)
  } else if (PROBE === 'base') {
    const g = []; for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); global.gc(); g.push(Number(process.hrtime.bigint() - t) / 1e6); } out.gcMs = g.sort((a, b) => a - b)[2];
  } else {
    R.setEconDay(() => day);
    const t0 = Date.now();
    quiet(() => R.init({ zoneId: ZONE, cellsW, cellsH, epoch: 0, dayMs: 1440000, broadcast: null }));
    out.initMs = Date.now() - t0;
    const S = R._S;
    out.n = { cells: S.cells.size, paved: S.paved.size, coarse: S.coarse.size, bootUnpaved: S.bootUnpaved.length };
    // 등급 수(그날 감쇠로 — 종전 식 그대로)
    let g1 = 0, g2 = 0; const DK = 0.995;
    for (const [, r] of S.cells) { const v = day > r.d ? r.v * Math.pow(DK, day - r.d) : r.v; if (v >= 28) g2++; else if (v >= 8) g1++; }
    out.n.g1 = g1; out.n.g2 = g2;
    const hInit = heap(); out.heapInit = MB(hInit); out.initMB = MB(hInit - h0);
    // `S.sent` — 첫 하루 마감 뒤처럼(등급 칸 → 등급)
    if (PROBE === 'full') {
      for (const [k, r] of S.cells) { const v = day > r.d ? r.v * Math.pow(DK, day - r.d) : r.v; const lv = v >= 28 ? 2 : (v >= 8 ? 1 : 0); if (lv) S.sent.set(k, lv); }
      const hS = heap(); out.sentMB = MB(hS - hInit); out.n.sent = S.sent.size;
      // 청소 멈춤 — 다 실은 채로 가득 수거 다섯 번
      const g = []; for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); global.gc(); g.push(Number(process.hrtime.bigint() - t) / 1e6); } out.gcMs = g.sort((a, b) => a - b)[2];
      // 접속 목록
      { const t = Date.now(); const c = R.clientRoads(); out.clientMs = Date.now() - t; out.clientCells = c.length / 3; out.clientJsonMB = MB(JSON.stringify(c).length); }
      // 덤프 · 되올림
      { const t = Date.now(); const o = R.t1382Dump(); const s = JSON.stringify(o); out.dumpMs = Date.now() - t; out.dumpMB = MB(s.length);
        out.dumpParts = Object.fromEntries(Object.entries(o).map(([k2, v2]) => [k2, MB(JSON.stringify(v2 === undefined ? null : v2).length)]));
        const hD = heap(); out.dumpHeldMB = MB(hD - hS);
        const t2 = Date.now(); R.t1382Load(JSON.parse(s)); out.loadMs = Date.now() - t2; }
      const hFull = heap();
      // 구조마다 지우며 차(뒤에서부터 — 지운 몫 = 그 구조가 쥐던 힙)
      const steps = [];
      const step = (name, f) => { const a = heap(); f(); const b = heap(); steps.push([name, MB(a - b)]); };
      step('sent', () => S.sent.clear());
      step('coarse', () => S.coarse.clear());
      step('paved', () => S.paved.clear());
      step('dirty', () => S.dirty.clear());
      step('bootUnpaved', () => { S.bootUnpaved = []; });
      step('cells', () => S.cells.clear());
      out.parts = steps; out.heapFull = MB(hFull); out.afterAll = MB(heap() - h0);
      const g2a = []; for (let i = 0; i < 5; i++) { const t = process.hrtime.bigint(); global.gc(); g2a.push(Number(process.hrtime.bigint() - t) / 1e6); } out.gcMsAfterClear = g2a.sort((a, b) => a - b)[2];
    }
  }
  process.stdout.write('@@T1448 ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 어미 ──────────────────────────────────────────────────────────────────────
const DB0 = A[0], OUT = A[1];
if (!DB0 || !OUT) { console.error('쓰는 법: t1448-road-diag.js <world.db 사본> <out.json> [--day N] [--zone hanbando]'); process.exit(2); }
const ONLY = (opt('only', '') || '').split(',').filter(Boolean);   // 갈래 몇만 다시 — 있는 OUT 에 덧쓴다(퍼짐 · 등급은 그대로)
const res = (ONLY.length && fs.existsSync(OUT)) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { db: path.basename(DB0), made: 'T1448', probes: {} };
const os = require('os');
const tmpDb = (tag) => { const p = path.join(os.tmpdir(), `t1448-${process.pid}-${tag}.db`); fs.copyFileSync(DB0, p); fs.chmodSync(p, 0o600); return p; };
for (const [tag, env] of [['base', {}], ['cells', {}], ['noi', { T688_ROAD_DAY: '0' }], ['full', {}], ['grid', {}]].filter(([t]) => !ONLY.length || ONLY.includes(t))) {
  const p = tmpDb(tag);
  const r = spawnSync(process.execPath, ['--experimental-sqlite', '--expose-gc', '--max-old-space-size=4096', __filename, p, ...A.slice(2)], { cwd: ROOT, env: Object.assign({}, process.env, env, { T1448_PROBE: tag }), encoding: 'utf8', maxBuffer: 64 << 20 });
  for (const f of [p, p + '-wal', p + '-shm']) { try { fs.unlinkSync(f); } catch (e) { } }
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@T1448 '));
  res.probes[tag] = line ? JSON.parse(line.slice(8)) : { err: String(r.stderr || '').slice(-600), rc: r.status };
  console.log(tag, JSON.stringify(res.probes[tag]).slice(0, 400));
}
// 퍼짐 — DB 에서 바로(읽기만)
if (!ONLY.length) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(DB0, { readOnly: true });
  const W = res.probes.full.cellsW || res.probes.base.cellsW, day = res.probes.full.day;
  const rows = db.prepare('SELECT cell_key, v, d FROM roads').all();
  const DK = 0.995;
  const spread = {};
  for (const C of [16, 32, 64, 128]) {
    const m = new Map(), mg = new Map();
    for (const r of rows) { const k = r.cell_key | 0, cx = k % W, cy = (k / W) | 0, ck = ((cy / C) | 0) * 100000 + ((cx / C) | 0); m.set(ck, (m.get(ck) || 0) + 1);
      const v = day > r.d ? r.v * Math.pow(DK, day - r.d) : r.v; if (v >= 8) mg.set(ck, (mg.get(ck) || 0) + 1); }
    const counts = [...m.values()].sort((a, b) => a - b), area = C * C;
    const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
    const hist = {}; for (const c of counts) { const f = c / area, b = f < 0.01 ? '<1%' : f < 0.05 ? '1-5%' : f < 0.2 ? '5-20%' : f < 0.5 ? '20-50%' : '50%+'; hist[b] = (hist[b] || 0) + 1; }
    // 배열 총량: 값 Float64(8) + 날 Int32(4) = 12 B/칸 · 밟힌 구역만
    spread[C] = { chunks: m.size, gradedChunks: mg.size, area, fill: { p10: q(0.1), p50: q(0.5), p90: q(0.9), max: counts[counts.length - 1] }, hist,
      arrayMB: MB(m.size * area * 12), arrayMBf32: MB(m.size * area * 8), cellsPerChunk: Math.round(rows.length / m.size) };
  }
  res.spread = spread;
  res.zoneCells = W * (res.probes.full.cellsH || 0);
  // 등급 · 날 퍼짐
  let g1 = 0, g2 = 0, dead = 0; const age = {};
  for (const r of rows) { const v = day > r.d ? r.v * Math.pow(DK, day - r.d) : r.v; if (v >= 28) g2++; else if (v >= 8) g1++; else if (v < 1) dead++;
    const a = day - r.d, b = a <= 1 ? '0-1' : a <= 7 ? '2-7' : a <= 30 ? '8-30' : a <= 138 ? '31-138' : a <= 540 ? '139-540' : '540+'; age[b] = (age[b] || 0) + 1; }
  res.grades = { rows: rows.length, g1, g2, under8: rows.length - g1 - g2, deadAtDay: dead, ageDays: age };
}
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log('→', OUT);
