#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-road-day.js — T688 길 하루 훅 쪼개기(`server/roads.js` · 손잡이 `T688_ROAD_DAY`) ==================================
//
// 같은 연산 줄(스탬프 · 조회 감쇠 · 지움 · 날 건너뛰기 · 다져진 길 오름/풀림)을 **끔 판**(종전 전수 재구축)과 **켬 판**(바뀐 셀만 · 묶음 행 상한)에
// 똑같이 먹이고 날마다 견준다:
//   ① 코스 지도(칸 → 등급) · `coarseGen` · 바뀐 칸(`takeCoarseChanges`) · 등급 셀 수 · 다져진 길 집합(차례까지) · 풀림 사건 차례 · 셀 값(v·d · 차례)
//   ② DB 행 — 하루 플러시가 다 끝난 뒤 두 판의 `roads` 표가 같다(같은 행 · 같은 값) · 켬은 묶음이 잘게 나뉘었다(상한이 실제로 물었다)
//   ③ 견줌 판(`verify`) — 세계는 끔 그대로 · 새 셈의 다섯 견줌 어긋남 0
//   ④ 하루 훅에서 다시 잰 셀 수 ≪ 밟힌 셀 전부(바뀐 셀만 보는가)
//   ⑤ 자명 통과 금지 — 문턱 날을 하루 늦게 · 문턱 날 셀을 안 봄 · 스탬프 자리에서 등급을 안 고침 · 쓰기 전 복사를 뺌 — 다 문다
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

// ── 가짜 시계 · 조각 예산(마을 모듈 대신 16ms) ───────────────────────────────────────────────
let NOW = 0; const realNow = Date.now; Date.now = () => NOW;
const _log = console.log; console.log = (...a) => { if (typeof a[0] === 'string' && (a[0].startsWith('[thr') || a[0].startsWith('[hanbando'))) return; _log(...a); };   // 판 로그(하루 플러시 줄)는 감춘다
const VP = require.resolve(path.join(ROOT, 'server', 'villages.js'));
require.cache[VP] = { id: VP, filename: VP, loaded: true, exports: { tickSliceMs: () => 16 } };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 't688-'));
const RP = path.join(ROOT, 'server', 'roads.js'), DP = path.join(ROOT, 'server', 'zone-local-db.js');
const SRC = fs.readFileSync(RP, 'utf8');
// 한 판 = roads.js 사본 하나 + 제 DB 하나(손잡이 · 글자 바꾸기)
function load(tag, mode, patch, dbFrom) {
  process.env.DB_PATH = path.join(TMP, tag + '.db'); process.env.ZONE_ID = 'thr';
  if (dbFrom) for (const x of ['', '-wal', '-shm']) { try { fs.copyFileSync(dbFrom + x, process.env.DB_PATH + x); } catch (e) {} }
  process.env.T688_ROAD_DAY = mode;
  delete require.cache[DP];
  const db = require(DP);
  const m = new Module(RP, module); m.filename = RP; m.paths = Module._nodeModulePaths(path.dirname(RP));
  const src = patch ? patch(SRC) : SRC;
  const orig = Module.prototype.require;
  m.require = function (id) { return id === './zone-local-db' ? db : orig.call(this, id); };
  m._compile(src, RP);
  return { R: m.exports, db, tag };
}
let W = 160, H = 128, ZID = 'thr'; const DAY = 1000, EPOCH = 0;
function mk(tag, mode, patch, dbFrom) {
  const X = load(tag, mode, patch, dbFrom); X.unp = []; X.pav = []; X.bc = []; X.wr = [];
  { const D = X.db, up = D.upsertRoadCell, del = D.deleteRoadCell;   // DB 쓰기 차례 · 값을 그대로 적는다(같은 행 · 같은 차례 견줌)
    D.upsertRoadCell = (z, k, v, d) => { X.wr.push(k + ':' + v + ':' + d); return up(z, k, v, d); };
    D.deleteRoadCell = (z, k) => { X.wr.push(k + ':-'); return del(z, k); }; }
  X.R.init({ zoneId: ZID, cellsW: W, cellsH: H, epoch: EPOCH, dayMs: DAY, broadcast: (m) => X.bc.push(JSON.stringify(m)),
    onPaved: (x, y) => X.pav.push(y * W + x), onUnpaved: (x, y) => X.unp.push(y * W + x) });
  X.R.takeCoarseChanges();   // 바뀐 칸 모으기 시작
  return X;
}
// 연산 줄 — 씨앗 LCG(판마다 같은 줄)
function script(seed, days) {
  let rs = seed; const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; };
  const ops = [];   // [day, kind, a, b]
  // 길 몇 가닥(자주 밟히는 줄 — 등급 1·2 를 받는다) + 흩어진 밟힘
  const trails = []; for (let i = 0; i < 14; i++) trails.push({ x: (rnd() * W) | 0, y: (rnd() * H) | 0, dx: rnd() < 0.5 ? 1 : 0, len: 10 + ((rnd() * 40) | 0), busy: rnd() });
  let day = 1;
  while (day <= days) {
    const n = 300 + ((rnd() * 500) | 0);
    for (let i = 0; i < n; i++) {
      if (rnd() < 0.7) { const T = trails[(rnd() * trails.length) | 0]; if (rnd() > T.busy + 0.2) continue; const j = (rnd() * T.len) | 0;
        ops.push([day, 's', Math.min(W - 1, T.x + (T.dx ? j : 0)), Math.min(H - 1, T.y + (T.dx ? 0 : j))]); }
      else if (rnd() < 0.8) ops.push([day, 's', (rnd() * W) | 0, (rnd() * H) | 0]);
      else ops.push([day, 'g', (rnd() * W) | 0, (rnd() * H) | 0]);   // 조회(게으른 감쇠 · 지움)
    }
    if (rnd() < 0.15) for (const T of trails) T.busy = rnd();   // 길이 식거나 다시 붐빈다(다져진 길이 풀린다)
    day += rnd() < 0.08 ? 2 + ((rnd() * 20) | 0) : 1;   // 가끔 여러 날을 건너뛴다(꺼진 날 · 문턱 날이 한꺼번에)
  }
  return ops;
}
const snap = (X) => {
  const S = X.R._S;
  return { coarse: [...S.coarse].sort((a, b) => a[0] - b[0]).map((x) => x.join(':')).join(','), gen: S.coarseGen, graded: S.stats.graded,
    paved: [...S.paved].join(','), cells: [...S.cells].map(([k, r]) => k + ':' + r.v + ':' + r.d).join(','), dirty: [...S.dirty].join(','),
    chg: X.R.takeCoarseChanges().map((x) => x.join(':')).sort().join(','), unp: X.unp.splice(0).join(','), pav: X.pav.splice(0).join(',') };
};
function drive(Xs, ops, day0) {
  let i = 0, bad = 0, days = 0, firstBad = null;
  const lastDay = ops[ops.length - 1][0];
  for (let day = day0 || 1; day <= lastDay + 1; day++) {
    NOW = EPOCH + day * DAY;
    for (const X of Xs) X.R.onGameTick(NOW);   // 날 경계 틱(재구축 · 얼리기)
    // 그날 연산 — 틱 사이사이(25 연산마다 한 틱 · 플러시 묶음이 연산과 섞인다 = 쓰기 전 복사가 실제로 문다)
    let tick = 0;
    while (i < ops.length && ops[i][0] === day) {
      const [, kind, a, b] = ops[i++]; NOW = EPOCH + day * DAY + 100 + (i % 800);
      for (const X of Xs) { if (kind === 's') X.R.stampCell(a, b); else X.R.levelOf(a, b); }
      if (i % 25 === 0) { tick++; for (const X of Xs) X.R.onGameTick(EPOCH + day * DAY + 1 + tick); }
    }
    for (let k = 0; k < 60; k++) { tick++; for (const X of Xs) X.R.onGameTick(EPOCH + day * DAY + 1 + tick); }   // 남은 묶음
    const s0 = snap(Xs[0]);
    for (let j = 1; j < Xs.length; j++) { const sj = snap(Xs[j]);
      for (const k of Object.keys(s0)) if (s0[k] !== sj[k]) { bad++; if (!firstBad) firstBad = `${Xs[j].tag} 날 ${day} · ${k}`; break; } }
    days++;
  }
  // 남은 묶음을 마저 쓴다(켬은 묶음이 잘아 판 끝에 그날 것이 남을 수 있다)
  for (const X of Xs) for (let k = 0; k < 500000; k++) { const p = X.R.roadDayPerf(); if (!p || !p.flPending) break; X.R.onGameTick(NOW + 1 + k); }
  // 하루 플러시(DB 쓰기 차례 · 값)와 방송은 묶음 틱이 판마다 달라 날 단위로는 안 견주고 **판 끝에 통째로** 견준다
  for (let j = 1; j < Xs.length; j++) {
    if (Xs[j].wr.join(',') !== Xs[0].wr.join(',')) { bad++; let q = 0; while (q < Xs[0].wr.length && Xs[0].wr[q] === Xs[j].wr[q]) q++;
      if (!firstBad) firstBad = `${Xs[j].tag} DB 쓰기 차례(${Xs[0].wr.length}/${Xs[j].wr.length} · 처음 다른 자리 ${q}: ${Xs[0].wr[q]} ↔ ${Xs[j].wr[q]})`; }
    if (Xs[j].bc.join('|') !== Xs[0].bc.join('|')) { bad++; if (!firstBad) firstBad = `${Xs[j].tag} 방송(${Xs[0].bc.length}/${Xs[j].bc.length})`; }
  }
  return { bad, days, firstBad };
}
const rowsOf = (X) => X.db.db.prepare('SELECT cell_key, v, d FROM roads ORDER BY cell_key').all().map((r) => `${r.cell_key}:${r.v}:${r.d}`).join(',');

console.log('\n① 끔 ↔ 켬 — 같은 연산 줄 · 날마다 견줌');
const OPS = script(688, 420);
const A = mk('off', ''), B = mk('on', '1'), V = mk('ver', 'verify');
const r1 = drive([A, B, V], OPS);
const SA = A.R._S;
ok(SA.cells.size > 1000 && SA.stats.graded > 200 && SA.paved.size + 0 >= 0 && SA.coarseGen > 20, '① [전제] 세계가 섰다 — 밟힌 셀 · 등급 셀 · 지도가 여러 번 바뀜',
  `셀 ${SA.cells.size} · 등급 ${SA.stats.graded} · 다져진 길 ${SA.paved.size} · coarseGen ${SA.coarseGen} · 날 ${r1.days}`);
ok(r1.bad === 0, '① ★끔 = 켬 = 견줌 — 날마다 코스 지도 · coarseGen · 바뀐 칸 · 등급 셀 수 · 다져진 길 집합(차례) · 풀림·오름 사건 차례 · 셀 값(차례) · dirty', `어긋난 날 ${r1.bad}${r1.firstBad ? ' · 처음 ' + r1.firstBad : ''}`);

console.log('\n② DB 행 — 묶음을 잘게 나눠도 같은 표');
ok(rowsOf(A) === rowsOf(B) && rowsOf(A).length > 0, '② ★두 판의 `roads` 표가 같다(키 · v · d)', `${A.db.db.prepare('SELECT COUNT(*) n FROM roads').get().n}행`);
const PB = B.R.roadDayPerf();
console.log(`    ↳ 켬 판 묶음 ${PB.flBatches} · 잘림 ${PB.flCapped} · 묶음 최대 ${PB.flMaxRows}행 · 속도 ${PB.flRate}행/ms(이 판 하루 행이 적어 상한 밑일 수 있다 — 아래 좁힌 판이 상한 갈래를 문다)`);
{ // 상한 갈래를 확실히 밟는 판 — 속도를 작게 눌러(하네스만 · 글자 바꾸기) 하루 행을 여러 묶음으로 자른다
  const rateLine = '  if (budgetMs > 0 && rows > 0 && ms > 0) { const r = rows / ms; _flDayMin = _flDayMin ? Math.min(_flDayMin, r) : r; _flRate = _flDayMin; }';
  ok(SRC.includes(rateLine), '② [전제] 속도 글자가 있다');
  const A2 = mk('off2', ''), C2 = mk('narrow', '1', (s) => s.replace(rateLine, '  _flRate = 3 / budgetMs;'));
  const r2 = drive([A2, C2], script(2688, 120));
  const PC = C2.R.roadDayPerf();
  ok(PC.flCapped > 50 && PC.flSnap > 50, '② [전제] 좁힌 판은 묶음을 실제로 잘랐고 · 그 사이 연산이 쓰기 전 복사를 밟았다', `잘림 ${PC.flCapped} · 묶음 ${PC.flBatches} · 최대 ${PC.flMaxRows}행 · 경계 값 적음 ${PC.flSnap}`);
  ok(r2.bad === 0 && rowsOf(A2) === rowsOf(C2), '② ★묶음 3행씩(행 상한) — 날마다 같은 세계 · 같은 `roads` 표', `어긋난 날 ${r2.bad} · ${A2.db.db.prepare('SELECT COUNT(*) n FROM roads').get().n}행`);
}

console.log('\n③ 견줌 판');
const PV = V.R.roadDayPerf();
ok(PV && PV.vDays >= r1.days - 2 && PV.vBad === 0, '③ ★견줌 — 새 셈 ↔ 종전 셈 다섯 견줌 어긋남 0', `날 ${PV && PV.vDays} · 어긋남 ${PV && PV.vBad}(코스 ${PV && PV.vBadCoarse} · 오름 ${PV && PV.vBadGen} · 바뀐 칸 ${PV && PV.vBadChg} · 등급 ${PV && PV.vBadGraded} · 풀림 ${PV && PV.vBadRel})`);

console.log('\n④ 바뀐 셀만 보는가');
ok(PB.days > 0 && PB.dueEvals / PB.days < SA.cells.size * 0.2, '④ 날 경계에 다시 잰 셀(문턱 날 셀만) ≪ 밟힌 셀 전부', `하루 평균 ${(PB.dueEvals / PB.days).toFixed(0)} · 칸 ${(PB.tgN / PB.days).toFixed(0)} · 밟힌 셀 ${SA.cells.size} · 값이 바뀐 자리(스탬프·조회) ${PB.touch}`);
ok(PB.dueEvals > 0, '④ [전제] 문턱 날로 다시 잰 셀이 있다(감쇠로 등급이 내려간 셀)', `${PB.dueEvals}`);

console.log('\n⑤ 자명 통과 금지');
let _bn = 0;
const bait = (label, a, b) => {
  _bn++;
  ok(SRC.includes(a), `⑤ [전제] 글자: ${label}`);
  const O = mk('b0_' + _bn, ''), P = mk('b1_' + _bn, '1', (s) => s.replace(a, b));
  const r = drive([O, P], script(1688, 300));
  ok(r.bad > 0, `⑤ ${label} — ① 이 **문다**`, `어긋난 날 ${r.bad}${r.firstBad ? ' · 처음 ' + r.firstBad : ''}`);
};
bait('문턱 날을 하루 늦게', '  return r.d + n;\n}', '  return r.d + n + 1;\n}');
bait('문턱 날 셀을 안 봄', '    if (dd > t) continue;', '    if (dd > t || true) continue;');
bait('스탬프 자리에서 등급을 안 고침', '  if (I.ready) _i688Touch(k, r, lv);', '  ');
{ // 쓰기 전 복사 미끼 — 좁힌 판(묶음 3행)에서 경계 값 적기를 빼면 ② 가 문다
  const rateLine = '  if (budgetMs > 0 && rows > 0 && ms > 0) { const r = rows / ms; _flDayMin = _flDayMin ? Math.min(_flDayMin, r) : r; _flRate = _flDayMin; }';
  const cow = 'if (_flCow) _flSnap(';
  ok(SRC.includes(rateLine) && SRC.includes(cow), '⑤ [전제] 글자: 속도 · 쓰기 전 복사');
  const O = mk('cw0', ''), P = mk('cw1', '1', (s) => s.replace(rateLine, '  _flRate = 3 / budgetMs;').split(cow).join('if (false) _flSnap('));
  const r = drive([O, P], script(3688, 150));
  ok(r.bad > 0 || rowsOf(O) !== rowsOf(P), '⑤ 쓰기 전 복사(경계 값 적기 셋 — 스탬프 · 새 셀 · 조회 감쇠)를 빼면 ② 가 **문다**', `어긋난 날 ${r.bad}${r.firstBad ? ' · 처음 ' + r.firstBad : ''} · 표 같음 ${rowsOf(O) === rowsOf(P)}`);
}

// ⑥ [선택 · `T688_REAL_DB=<틀 DB>`] 실제 크기 — 틀의 `roads` 표(한반도 · 밟힌 셀 24만)를 그대로 싣고 같은 연산 줄로 날을 넘긴다
if (process.env.T688_REAL_DB) {
  console.log('\n⑥ 실제 크기 — 틀 DB 의 길 표로 날을 넘긴다');
  const { DatabaseSync } = require('node:sqlite');
  const D = new DatabaseSync(process.env.T688_REAL_DB, { readOnly: true });
  const meta = D.prepare("SELECT COUNT(*) n, MAX(d) b FROM roads WHERE zone = 'hanbando'").get();
  const keys = D.prepare("SELECT cell_key k, v FROM roads WHERE zone = 'hanbando'").all(); D.close();
  W = 2208; H = 4064; ZID = 'hanbando';   // 한반도 69 × 127 청크 × 32칸
  const d0 = meta.b + 1;
  NOW = EPOCH + d0 * DAY;
  const O = mk('roff', '', null, process.env.T688_REAL_DB), N = mk('ron', '1', null, process.env.T688_REAL_DB), Vr = mk('rver', 'verify', null, process.env.T688_REAL_DB);
  // 연산 줄 — 하루 스탬프 ≈3만(T686 판의 하루 행 3.1만~3.4만) · 밟힌 셀에서 고르되 등급 셀을 더 자주 · 가끔 여러 날 건너뛰기
  let rs = 6880; const rnd = () => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return rs / 4294967296; };
  const graded = keys.filter((x) => x.v >= 8).map((x) => x.k), all = keys.map((x) => x.k);
  const ops = []; let day = d0;
  for (let n = 0; n < +(process.env.T688_REAL_N || 40); n++) {
    for (let i = 0; i < 30000; i++) {
      const pool = rnd() < 0.6 ? graded : all, k = pool[(rnd() * pool.length) | 0], cx = k % W + (rnd() < 0.2 ? 1 : 0), cy = (k / W) | 0;
      ops.push([day, rnd() < 0.92 ? 's' : 'g', Math.min(W - 1, cx), cy]);
    }
    day += rnd() < 0.15 ? 2 + ((rnd() * 25) | 0) : 1;
  }
  const r6 = drive([O, N, Vr], ops, d0);
  const P6 = Vr.R.roadDayPerf(), PN = N.R.roadDayPerf();
  ok(r6.bad === 0 && P6.vBad === 0, '⑥ ★실제 크기 — 끔 = 켬 = 견줌(날마다 일곱 가지 · 견줌 다섯)', `날 ${r6.days} · 어긋남 ${r6.bad}${r6.firstBad ? ' · 처음 ' + r6.firstBad : ''} · 견줌 ${P6.vBad}/${P6.vDays}`);
  ok(rowsOf(O) === rowsOf(N), '⑥ ★`roads` 표 같다', `${O.db.db.prepare('SELECT COUNT(*) n FROM roads').get().n}행`);
  console.log(`    ↳ 밟힌 셀 ${O.R._S.cells.size} · 등급 ${O.R._S.stats.graded} · 다져진 길 ${O.R._S.paved.size} · 하루 재구축 종전 최대 ${P6.fullMaxMs.toFixed(1)}ms(평균 ${(P6.fullMs / P6.vDays).toFixed(1)}) · 새 셈 최대 ${PN.maxMs.toFixed(1)}ms(평균 ${(PN.ms / PN.days).toFixed(1)}) · 경계 문턱 날 셀 ${(PN.dueEvals / PN.days).toFixed(0)}/날 · 쓰기 전 복사 ${PN.flSnap}`);
}

Date.now = realNow;
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
