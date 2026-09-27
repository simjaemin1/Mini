#!/usr/bin/env node
// (@regress 없음 — 러너 밖 계측기)
// =============================================================================
// T426 ④ 자 — **고리 비용 표**(T398 §1-4 의 두 길 ⓐ·ⓑ) · 표만 — 제품은 한 글자도 안 바꾼다 (2026-09-26)
//
// T398 이 잰 것: 고리(영토 밖 · 체비쇼프 ≤ T325_R)는 네모의 ×5.8 셀이다 — 마을 하나 하루 스캔(셀마다 색인 질의)
//   중앙 42.6ms · 가장 무거운 임업1 1,399ms · 6초 판 존 루프 p95 37 → 1,028ms. 줄이는 길 둘(값·문 판정은 PM):
//   ⓐ 교란 전 수가 0 인 셀(원시 색인에 나무·묘목이 없다)을 **날마다는 안 묻는다** — 원시 수는 이미 `_needK`(T341 `K`)
//      가 셀 집합이 바뀐 날 한 번 센다 · 셀마다 "원시 > 0" 한 칸이면 된다.
//   ⓑ 셀 대신 **청크 한 판**을 하루 한 번 낳아 셀 → 나무 표로 묻는다(`zone.js warTreeCellBlocked` · T295 꼴).
//
// ★무엇을 재나(존 0 · 같은 색인 정본 · 같은 장부 · 같은 날)
//   0) 입력 — T378 게이트 판 40일 DB(`T426_DB`) · 고리는 **제품 함수**(`villages.js _t398Cells`)가 낸다(사본 0).
//   1) 지금 — 셀마다 `resourcesAtCell(장부 · 날)` 에서 나무꾼 종(`_T325_TYPES` 그 둘 = tree·sapling)을 센다.
//   2) ⓐ — 원시 수(장부 없이) 한 판(= `K` 날의 일) → 원시 > 0 셀만 1) 과 같이 묻는다.
//   3) ⓑ — 고리 셀이 닿는 청크(넘침 이웃 포함 — `resourcesAtCell` 의 판정 그대로)를 한 판씩 낳아 셀 → 수 표 → 셀마다 표를 본다.
//   ★셋의 **답이 셀마다 같아야** 한다(같지 않으면 그 길은 값이 아니라 결함이다 — 표에 빨갛게 적는다).
//   ★의미 변화 — ⓐ를 **셀째로** 건너뛰면(생활층 쪽 문) 원시 0 셀의 **DB 나무**(심은 나무 · `resources` 표)를 못 본다.
//     존 쪽 문(`_actEntitiesAtCell` 의 색인 질의만 건너뛰기)이면 쿼드트리 갈래가 먼저 본다(DB 나무는 부팅에 전부 올라온다).
//     ⇒ 고리 안 원시 0 셀의 DB 나무 수를 센다.
//
// 쓰는 법:  T426_DB=/path/w40.db node scripts/t426-ring-cost.js [out.json]
//   T426_REPS=3(판 수 · 중앙값) · T426_DAY=(게임일 · 없으면 장부의 가장 늦은 날)
//
// ★★[T440 2026-09-27] `--zone` — **제품 문 그대로** 잰다(ⓑ 를 제품에 넣은 뒤 · 존을 이 프로세스 안에 띄운다 · 마을 끔 ·
//   장부는 DB 에서 · 시계는 `__e2e_clock`). 서버 코드 자리는 `T426_ROOT`(베이스 워크트리를 같은 자로 · 없으면 이 레포).
//   ① 하루 50마을 고리 스캔 — 나무꾼이 부르는 그 문(`_t325TreesAtCell`)으로 고리 셀 전부 · 날 셋(날이 바뀌면 판이 낡는다 =
//      날마다 차가운 판) + 같은 날 한 번 더(표 조회만). ② 셀 답 비트 동일 — 고리 셀 전수 × (장부·원시) · `_idxAtCell` ↔
//      `resourcesAtCell`(같은 장부 · 같은 날 · JSON 통째) · 제품 문(`_t325TreesAtCell`) ↔ 색인을 종으로 거른 것.
//   ③ 사건 — 마을마다 고리의 나무 한 그루를 **벤다**(`_t325CutTreeAt` · 나무꾼 문) → 그 셀 답 대조 · **되살린다**
//      (`_t341Unharvest`) → 대조 · **날을 넘긴다**(벤 그루가 묘목이 되는 날) → 대조 · **심는다**(`tryPlantTree`) → 색인은 그대로
//      · 제품 문은 심은 묘목을 낸다. ★미끼: 판을 안 비우는 코드(돌연변이 워크트리)로 돌리면 ③ 이 빨갛다.
//   쓰는 법: T426_DB=<40일 DB> [T426_ROOT=<워크트리>] node scripts/t426-ring-cost.js --zone [out.json]
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const ZID = 'hanbando';
const DB = process.env.T426_DB;
const OUT = process.argv[2] || '/tmp/t426-ring-cost.json';
if (!DB || !fs.existsSync(DB)) { console.log('T426_DB=<40일 DB> 가 필요하다'); process.exit(2); }
const REPS = Math.max(1, +(process.env.T426_REPS || 3));
//   ★[T440] 제품 문 판 — 위 머리글 `--zone`(아래 함수 · 이 파일 끝)
if (process.argv[2] === '--zone') {
  zoneMode().then(() => process.exit(0), (e) => { process.stdout.write('자 크래시: ' + ((e && e.stack) || e) + '\n'); process.exit(1); });
  return;
}
const _log = console.log;
console.log = () => {};                                   // 모듈 적재 소음(econ-sim 등) — 표만 남긴다
const CH = require(path.join(ROOT, 'server', 'chunk.js'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
const V = require(path.join(ROOT, 'server', 'villages.js'));
console.log = _log;
const say = (s) => process.stdout.write(s + '\n');

// ── 입력 ────────────────────────────────────────────────────────────────────
const D = require(path.join(ROOT, 'node_modules', 'better-sqlite3'))(DB, { readonly: true });
const vils = D.prepare('SELECT id, name, cx, cy FROM villages').all();
const terr = D.prepare("SELECT village_id, cx, cy FROM village_buildings WHERE type = 'terr'").all();
const ledger = new Map(D.prepare('SELECT seed_key, harvested_day FROM harvested_seeds').all().map((r) => [r.seed_key, r.harvested_day]));
let dbTrees = [];
try { dbTrees = D.prepare("SELECT id, type, x, y FROM resources WHERE type IN ('tree','sapling')").all(); } catch (e) {}
D.close();
let maxDay = -Infinity; for (const v of ledger.values()) if (v > maxDay) maxDay = v;
const DAY = process.env.T426_DAY != null ? +process.env.T426_DAY : maxDay;
const by = new Map(); for (const t of terr) { if (!by.has(t.village_id)) by.set(t.village_id, new Set()); by.get(t.village_id).add(t.cx + ',' + t.cy); }
const pv = vils.map((v) => ({ name: v.name, dbId: v.id, ccx: v.cx, ccy: v.cy, _terrSet: by.get(v.id) || new Set() }));
//   ★나무꾼 종 집합 — `zone.js` 의 `_T325_TYPES` 를 **글자로 읽는다**(여기 표를 새로 안 적는다)
const _tt = /const _T325_TYPES = \{([^}]*)\}/.exec(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'));
const TYPES = new Set(_tt ? [..._tt[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]) : []);
if (!TYPES.size) { say('★zone.js 에서 _T325_TYPES 를 못 읽었다'); process.exit(1); }
const biome = ZONES[ZID].biome, cs = CH.CHUNK_SIZE;
const optN = { biome, chunkSize: cs, harvestedSet: ledger, gameDay: DAY };
const optK = { biome, chunkSize: cs };
const rings = pv.map((v) => V._t398Cells(v, pv));
const ns = () => process.hrtime.bigint();
const ms = (a) => Number(process.hrtime.bigint() - a) / 1e6;
const cnt = (a) => { let n = 0; for (const e of a) if (TYPES.has(e.type)) n++; return n; };
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
const mx = (a) => a.reduce((x, y) => Math.max(x, y), -Infinity);
const sum = (a) => a.reduce((x, y) => x + y, 0);
say(`[자] 입력 ${path.basename(DB)} · 마을 ${vils.length} · 영토 ${terr.length}셀 · 장부 ${ledger.size}행 · 게임일 ${DAY} · 나무꾼 종 {${[...TYPES].join(',')}} · 판 ${REPS}번(중앙값)`);
say(`[자] 고리 셀 합 ${sum(rings.map((r) => r.xy.length / 2))} · 마을당 중앙 ${med(rings.map((r) => r.xy.length / 2))} · 네모로 돌아간 마을 ${rings.filter((r) => !r.ring).length}`);
// 데우기(JIT) — T398 벤치 그대로
for (let i = 0; i < 3000; i++) CH.resourcesAtCell(ZID, 1000 + (i % 50), 1000 + Math.floor(i / 50), optN);

// ── 1) 지금 — 셀마다 색인 ─────────────────────────────────────────────────────
function scanNow(xy) { const out = new Map(); for (let i = 0; i < xy.length; i += 2) { const x = xy[i], y = xy[i + 1]; if (x < 0 || y < 0) continue; const n = cnt(CH.resourcesAtCell(ZID, x, y, optN)); if (n) out.set(x * 65536 + y, n); } return out; }
// ── 2) ⓐ 원시 0 셀 건너뛰기 — 원시 한 판(K 날) · 그 뒤 날마다 원시 > 0 셀만 ─────────
function rawPass(xy) { const keep = []; let raw = 0; for (let i = 0; i < xy.length; i += 2) { const x = xy[i], y = xy[i + 1]; if (x < 0 || y < 0) continue; const n = cnt(CH.resourcesAtCell(ZID, x, y, optK)); if (n) { keep.push(x, y); raw += n; } } return { keep, raw }; }
// ── 3) ⓑ 청크 한 판 — 고리 셀이 닿는 청크(넘침 이웃은 `resourcesAtCell` 의 겹침 판정 그대로) ───
//   넘침 상한 — `zone.js warTreeCellBlocked`(T295) 가 쓰는 그 유도(`forestSpacing(FOREST_MIN_COV)` · 정본 · 새 수 0)
const OV = (typeof CH.forestSpacing === 'function' && CH.FOREST_MIN_COV != null) ? CH.forestSpacing(CH.FOREST_MIN_COV) : null;
function chunksOf(xy) {
  const S = new Set();
  const ov = OV != null ? OV : cs;   // 정본 상수를 못 받으면 청크 하나 통째(보수)
  for (let i = 0; i < xy.length; i += 2) {
    const x = xy[i], y = xy[i + 1]; if (x < 0 || y < 0) continue;
    const px = x * 32, py = y * 32, ccx = Math.floor(px / cs), ccy = Math.floor(py / cs);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const qx = ccx + dx, qy = ccy + dy; if (qx < 0 || qy < 0) continue;
      const bx0 = qx * cs, by0 = qy * cs;
      if (px + 31 < bx0 - ov || px > bx0 + cs - 1 + ov) continue;
      if (py + 31 < by0 - ov || py > by0 + cs - 1 + ov) continue;
      S.add(qx * 100000 + qy);
    }
  }
  return S;
}
function buildTable(chunks, table, done) {   // 청크마다 한 판 — 셀 → 나무꾼 종 수
  let n = 0;
  for (const k of chunks) {
    if (done.has(k)) continue; done.add(k); n++;
    const qx = Math.floor(k / 100000), qy = k % 100000;
    const got = CH.generateChunkResources(ZID, biome, qx, qy, cs, ledger, DAY);
    for (const e of got) { if (!TYPES.has(e.type)) continue; const c = Math.floor(e.x / 32) * 65536 + Math.floor(e.y / 32); table.set(c, (table.get(c) || 0) + 1); }
  }
  return n;
}
function scanTable(xy, table) { const out = new Map(); for (let i = 0; i < xy.length; i += 2) { const x = xy[i], y = xy[i + 1]; if (x < 0 || y < 0) continue; const n = table.get(x * 65536 + y) || 0; if (n) out.set(x * 65536 + y, n); } return out; }
const same = (a, b) => { if (a.size !== b.size) return false; for (const [k, v] of a) if (b.get(k) !== v) return false; return true; };

const rows = pv.map((v, i) => ({ name: v.name, cells: rings[i].xy.length / 2, now: [], raw: [], a: [], bOwn: [], bLook: [] }));
let ok = { a: 0, b: 0 }, bad = { a: [], b: [] };
const dayB = [];   // ⓑ 하루(50마을 차례 · 청크는 그날 처음 닿은 마을이 낳는다)
for (let rep = 0; rep < REPS; rep++) {
  const table = new Map(), done = new Set();
  let bDay = 0, chunkGen = 0;
  for (let i = 0; i < pv.length; i++) {
    const xy = rings[i].xy, r = rows[i];
    let t = ns(); const A = scanNow(xy); r.now.push(ms(t));
    t = ns(); const P = rawPass(xy); r.raw.push(ms(t)); r.keepCells = P.keep.length / 2; r.K = P.raw;
    t = ns(); const B = scanNow(P.keep); r.a.push(ms(t));
    t = ns(); const cks = chunksOf(xy); const g = buildTable(cks, table, done); const tOwn = ms(t); chunkGen += g;
    t = ns(); const C = scanTable(xy, table); const tLook = ms(t);
    r.bOwn.push(tOwn + tLook); r.bLook.push(tLook); r.chunks = cks.size; bDay += tOwn + tLook;
    r.N = [...A.values()].reduce((s, n) => s + n, 0);
    if (rep === 0) {
      if (same(A, B)) ok.a++; else bad.a.push(r.name);
      if (same(A, C)) ok.b++; else bad.b.push(r.name);
    }
  }
  dayB.push({ ms: bDay, chunks: done.size, gen: chunkGen, cells: table.size });
}
for (const r of rows) for (const k of ['now', 'raw', 'a', 'bOwn', 'bLook']) r[k] = med(r[k]);

// ── 의미 변화 — 고리 안 원시 0 셀의 DB 나무(ⓐ 를 셀째로 건너뛰면 못 본다) ───────────
const rawZeroDb = (() => {
  const ringCells = new Map(); rings.forEach((R, i) => { for (let j = 0; j < R.xy.length; j += 2) ringCells.set(R.xy[j] * 65536 + R.xy[j + 1], i); });
  let inRing = 0, inRawZero = 0;
  for (const t of dbTrees) {
    const cx = Math.floor(t.x / 32), cy = Math.floor(t.y / 32), k = cx * 65536 + cy;
    if (!ringCells.has(k)) continue; inRing++;
    if (!cnt(CH.resourcesAtCell(ZID, cx, cy, optK))) inRawZero++;
  }
  return { dbTrees: dbTrees.length, inRing, inRawZero };
})();

// ── 표 ─────────────────────────────────────────────────────────────────────
const col = (k) => rows.map((r) => r[k]);
const cellsAll = sum(col('cells')), keepAll = sum(col('keepCells'));
const dayNow = sum(col('now')), dayA = sum(col('a')), dayRaw = sum(col('raw'));
const bMed = med(dayB.map((d) => d.ms)), bD = dayB[0];
const heavy = rows.slice().sort((a, b) => b.now - a.now)[0];
say(`\n=== ④ 고리 비용 — 마을 하나 하루 스캔(ms · ${REPS}판 중앙) · 50마을 하루 합 ===`);
say(`| 길 | 묻는 셀(합) | 마을당 중앙 | 가장 무거운 마을 | 50마을 하루 합 | 셀마다 답이 지금과 같나 |`);
say(`|---|---|---|---|---|---|`);
say(`| 지금(셀마다 색인) | ${cellsAll} | ${med(col('now')).toFixed(1)} | ${heavy.name} ${heavy.now.toFixed(0)}(${heavy.cells}칸) | ${dayNow.toFixed(0)} | — |`);
say(`| ⓐ 원시 0 셀 건너뛰기(날마다) | ${keepAll}(${(100 * keepAll / cellsAll).toFixed(1)}%) | ${med(col('a')).toFixed(1)} | ${heavy.name} ${heavy.a.toFixed(0)}(${heavy.keepCells}칸) | ${dayA.toFixed(0)} | ${ok.a}/${rows.length}${bad.a.length ? ' ★' + bad.a.join(',') : ''} |`);
say(`| ⓐ 의 원시 한 판(셀 집합이 바뀐 날 · 지금도 \`K\` 로 도는 일) | ${cellsAll} | ${med(col('raw')).toFixed(1)} | ${heavy.name} ${heavy.raw.toFixed(0)} | ${dayRaw.toFixed(0)} | — |`);
say(`| ⓑ 청크 한 판(하루 · 그날 처음 닿은 마을이 낳는다) | 청크 ${bD.chunks}판 → 나무 선 셀 ${bD.cells} | ${med(col('bOwn')).toFixed(1)} | ${rows.slice().sort((a, b) => b.bOwn - a.bOwn)[0].name} ${mx(col('bOwn')).toFixed(0)} | ${bMed.toFixed(0)} | ${ok.b}/${rows.length}${bad.b.length ? ' ★' + bad.b.join(',') : ''} |`);
say(`| ⓑ 표 조회만(청크를 다 낳은 뒤) | ${cellsAll} | ${med(col('bLook')).toFixed(2)} | — | ${sum(col('bLook')).toFixed(1)} | — |`);
say(`\n마을당 청크(고리가 닿는 · 넘침 이웃 포함) 중앙 ${med(col('chunks'))} · 최대 ${mx(col('chunks'))} · 존 전체에서 서로 다른 청크 ${bD.chunks}판(하루 한 번씩 낳으면 된다)`);
say(`의미 변화(ⓐ 를 생활층 쪽에서 셀째로 건너뛸 때): 이 세계 DB 나무 ${rawZeroDb.dbTrees}그루 · 그중 고리 안 ${rawZeroDb.inRing} · 원시 0 셀 ${rawZeroDb.inRawZero} ⇒ 못 보게 되는 그루 ${rawZeroDb.inRawZero}`);
say(`   (존 쪽 문이면 0 — \`_actEntitiesAtCell\` 이 쿼드트리 갈래를 먼저 보고, DB 나무는 부팅에 전부 올라온다 · 색인 질의만 건너뛴다)`);
fs.writeFileSync(OUT, JSON.stringify({ db: DB, day: DAY, reps: REPS, types: [...TYPES], cells: cellsAll, keep: keepAll, dayNow, dayA, dayRaw, dayB, ok, bad, rawZeroDb,
  rows: rows.map((r) => ({ name: r.name, cells: r.cells, keep: r.keepCells, K: r.K, N: r.N, chunks: r.chunks, now: +r.now.toFixed(2), a: +r.a.toFixed(2), raw: +r.raw.toFixed(2), bOwn: +r.bOwn.toFixed(2), bLook: +r.bLook.toFixed(3) })) }, null, 1));
say(`\n표 → ${OUT}`);

// ══ ★[T440] `--zone` — 제품 문 그대로 ════════════════════════════════════════════
async function zoneMode() {
  const SROOT = process.env.T426_ROOT ? path.resolve(process.env.T426_ROOT) : ROOT;
  const OUTZ = process.argv[3] || '/tmp/t440-ring-zone.json';
  const say = (s) => process.stdout.write(s + '\n');
  const WORK = `/tmp/t440-ring-zone-${process.pid}.db`;
  const rmW = () => { for (const x of ['', '-wal', '-shm']) { try { fs.unlinkSync(WORK + x); } catch (e) {} } };
  rmW(); for (const x of ['', '-wal', '-shm']) { try { fs.copyFileSync(DB + x, WORK + x); } catch (e) {} }
  process.on('exit', rmW);
  Object.assign(process.env, { ZONE_ID: ZID, PORT: String(40700 + (process.pid % 200)), DB_PATH: WORK,
    ENABLE_VILLAGES: '0', ENABLE_WILDLIFE: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', E2E_GIVE: '1' });
  const logs = [];
  const _l = console.log, _w = console.warn, _e = console.error;
  console.log = (...a) => logs.push(a.map(String).join(' ')); console.warn = console.log; console.error = console.log;
  const Zone = require(path.join(SROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  await new Promise((r) => setImmediate(r));
  const CHz = require(path.join(SROOT, 'server', 'chunk.js'));
  const { ZONES: ZN } = require(path.join(SROOT, 'server', 'zone-config.js'));
  const Vz = require(path.join(SROOT, 'server', 'villages.js'));
  console.log = _l; console.warn = _w; console.error = _e;
  const hasIdx = typeof H._idxAtCell === 'function';
  const me = { pid: 'p_t440', playerId: 't440', name: 't440', persistent: false, ws: { readyState: 1, send: () => {} },
    x: 100, y: 100, vx: 0, vy: 0, floor: 0, hp: 100, maxHp: 100, hunger: 100, thirst: 100, inventory: {}, toolItems: [],
    equipment: [], equipSlots: {}, lots: {}, isNpc: false, isDown: false, tribeId: null, lastSeen: Date.now() };
  const clock = (d) => H.handlePlayerInput(me, JSON.stringify({ type: '__e2e_clock', day: d, night: false }));
  //   입력 — 마을·영토는 DB(존은 마을을 안 띄운다 · 장부는 존이 DB 에서 올렸다)
  const Dz = require(path.join(ROOT, 'node_modules', 'better-sqlite3'))(WORK, { readonly: true });
  const vz = Dz.prepare('SELECT id, name, cx, cy FROM villages').all();
  const tz = Dz.prepare("SELECT village_id, cx, cy FROM village_buildings WHERE type = 'terr'").all();
  const ledN = Dz.prepare('SELECT COUNT(*) n FROM harvested_seeds').get().n;
  let D0 = -Infinity; for (const r of Dz.prepare('SELECT harvested_day d FROM harvested_seeds').all()) if (r.d > D0) D0 = r.d;
  Dz.close();
  if (process.env.T426_DAY != null) D0 = +process.env.T426_DAY;
  const byz = new Map(); for (const t of tz) { if (!byz.has(t.village_id)) byz.set(t.village_id, new Set()); byz.get(t.village_id).add(t.cx + ',' + t.cy); }
  const pvz = vz.map((v) => ({ name: v.name, dbId: v.id, ccx: v.cx, ccy: v.cy, _terrSet: byz.get(v.id) || new Set() }));
  const R = pvz.map((v) => Vz._t398Cells(v, pvz));
  const cellsAll = R.reduce((a, r) => a + r.xy.length / 2, 0);
  const tt = /const _T325_TYPES = \{([^}]*)\}/.exec(fs.readFileSync(path.join(SROOT, 'server', 'zone.js'), 'utf8'));
  const TY = new Set(tt ? [...tt[1].matchAll(/(\w+)\s*:/g)].map((m) => m[1]) : []);
  const bz = ZN[ZID].biome, csz = CHz.CHUNK_SIZE;
  const res = { root: SROOT, db: DB, hasIdx, villages: vz.length, ledger: ledN, day0: D0, cells: cellsAll };
  say(`[자 --zone] 코드 ${SROOT === ROOT ? '이 레포' : SROOT} · 청크 판 문 ${hasIdx ? '있음' : '없음(옛 코드 — 셀마다 색인)'} · 마을 ${vz.length} · 고리 셀 ${cellsAll} · 장부 ${ledN}행 · 게임일 ${D0}`);
  const nsz = () => process.hrtime.bigint(), msz = (a) => Number(process.hrtime.bigint() - a) / 1e6;
  const medz = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor((b.length - 1) / 2)]; };
  //   데우기(JIT) — 이 날의 판은 버린다(아래 첫 날은 다른 날이다)
  clock(D0 - 1);
  for (let i = 0; i < 3000; i++) H._t325TreesAtCell(1000 + (i % 50), 1000 + Math.floor(i / 50));
  // ── ① 하루 50마을 — 날 셋(차가운 판) + 같은 날 한 번 더(표 조회만) ─────────────
  const perDay = [];
  const vilMs = pvz.map(() => []);
  const scanAll = (store) => {
    let tot = 0;
    for (let i = 0; i < R.length; i++) {
      const xy = R[i].xy, t0 = nsz();
      for (let j = 0; j < xy.length; j += 2) { const x = xy[j], y = xy[j + 1]; if (x < 0 || y < 0) continue; H._t325TreesAtCell(x, y); }
      const m = msz(t0); tot += m; if (store) vilMs[i].push(m);
    }
    return tot;
  };
  const st0 = hasIdx ? Object.assign({}, H._ringStat) : null;
  for (let d = 0; d < REPS; d++) {
    clock(D0 + d);
    const cold = scanAll(true);
    const warm = scanAll(false);
    perDay.push({ day: D0 + d, cold, warm });
  }
  const vm = vilMs.map((a) => medz(a));
  const heavy = vm.indexOf(Math.max(...vm));
  res.day = { perDay, vilMed: medz(vm), vilMax: Math.max(...vm), heavy: pvz[heavy].name, heavyCells: R[heavy].xy.length / 2, sumMed: medz(perDay.map((p) => p.cold)), warmMed: medz(perDay.map((p) => p.warm)) };
  if (hasIdx) { const st = H._ringStat; res.day.stat = { miss: st.miss - st0.miss, hit: st.hit - st0.hit, buildMs: (st.us - st0.us) / 1000, tables: H._ringCache.size }; }
  say(`① 하루 50마을(차가운 판 · 날 ${REPS}) — 합 중앙 ${res.day.sumMed.toFixed(0)}ms(${perDay.map((p) => p.cold.toFixed(0)).join(' · ')}) · 마을 중앙 ${res.day.vilMed.toFixed(1)}ms · 가장 무거운 ${res.day.heavy} ${res.day.vilMax.toFixed(1)}ms(${res.day.heavyCells}칸) · 같은 날 한 번 더(표 조회만) ${res.day.warmMed.toFixed(0)}ms`
    + (res.day.stat ? ` · 판 낳음 ${res.day.stat.miss}번 ${res.day.stat.buildMs.toFixed(0)}ms · 판 ${res.day.stat.tables}` : ''));
  if (!hasIdx) { fs.writeFileSync(OUTZ, JSON.stringify(res, null, 1)); say(`표 → ${OUTZ}`); return; }
  // ── ② 셀 답 비트 동일 — 고리 셀 전수 × (장부·원시) · 제품 문 ────────────────────
  const dayNow = D0 + REPS - 1;
  clock(dayNow);
  const J = (a) => JSON.stringify(a);
  const cmpCell = (x, y, day) => {
    const A = J(H._idxAtCell(x, y, false, day));
    const Rr = CHz.resourcesAtCell(ZID, x, y, { biome: bz, chunkSize: csz, harvestedSet: H.harvestedSeeds, gameDay: day });
    const ok1 = A === J(Rr);
    const ok2 = J(H._t325TreesAtCell(x, y)) === J(Rr.filter((e) => TY.has(e.type)));
    return { ok: ok1 && ok2, ok1, ok2, R: Rr };
  };
  let n = 0, badN = 0, badR = 0, badP = 0, ents = 0; const badList = [];
  const t2 = nsz();
  for (let i = 0; i < R.length; i++) {
    const xy = R[i].xy;
    for (let j = 0; j < xy.length; j += 2) {
      const x = xy[j], y = xy[j + 1]; if (x < 0 || y < 0) continue;
      n++;
      const c = cmpCell(x, y, dayNow); ents += c.R.length;
      if (!c.ok1) { badN++; if (badList.length < 5) badList.push(`${pvz[i].name}(${x},${y}) 장부`); }
      if (!c.ok2) { badP++; if (badList.length < 5) badList.push(`${pvz[i].name}(${x},${y}) 제품 문`); }
      const Ar = J(H._idxAtCell(x, y, true));
      if (Ar !== J(CHz.resourcesAtCell(ZID, x, y, { biome: bz, chunkSize: csz }))) { badR++; if (badList.length < 5) badList.push(`${pvz[i].name}(${x},${y}) 원시`); }
    }
  }
  res.same = { cells: n, entities: ents, badLedger: badN, badRaw: badR, badProduct: badP, ms: msz(t2), bad: badList };
  say(`② 셀 답 비트 동일 — 고리 셀 ${n} × (장부 · 원시 · 제품 문) · 개체 ${ents} · 어긋난 셀: 장부 ${badN} · 원시 ${badR} · 제품 문 ${badP}${badList.length ? ' ★' + badList.join(', ') : ''}`);
  // ── ③ 사건 — 벰 · 되살림 · 날 넘김(재생 단계) · 심음 ───────────────────────
  const ev = { cut: { n: 0, same: 0, changed: 0 }, unh: { n: 0, same: 0, changed: 0 }, stage: { n: 0, same: 0, changed: 0 }, plant: { n: 0, idxSame: 0, product: 0 } };
  const picks = [];
  for (let i = 0; i < R.length; i++) {   // 마을마다 고리의 나무 한 그루(그 셀의 첫 개체가 성목)
    const xy = R[i].xy;
    for (let j = 0; j < xy.length; j += 2) {
      const x = xy[j], y = xy[j + 1]; if (x < 0 || y < 0) continue;
      const a = H._t325TreesAtCell(x, y);
      if (a.length && a[0].type === 'tree' && a[0].seedKey && !H.harvestedSeeds.has(a[0].seedKey)) { picks.push({ vil: pvz[i].name, x, y, seedKey: a[0].seedKey, before: J(CHz.resourcesAtCell(ZID, x, y, { biome: bz, chunkSize: csz, harvestedSet: H.harvestedSeeds, gameDay: dayNow })) }); break; }
    }
  }
  //   벤다 — 나무꾼 문(`_t325CutTreeAt` → `_actTakeAtCell` → `_markHarvested`)
  for (const p of picks) {
    const loot = H._t325CutTreeAt(p.x, p.y);
    if (!loot) continue;
    ev.cut.n++;
    const c = cmpCell(p.x, p.y, dayNow);
    if (c.ok) ev.cut.same++;
    if (J(c.R) !== p.before) ev.cut.changed++;
    p.afterCut = J(c.R);
  }
  //   날을 넘긴다 — 벤 그루가 가장 빨리 묘목이 되는 날(정본: 셀 답이 바뀌는 첫 날을 찾지 않고, 종 표에서 유도)
  const TR = require(path.join(SROOT, 'server', 'trees.js'));
  const YD = require(path.join(SROOT, 'server', 'events.js')).yearDaysOf();
  let sapD = Infinity;
  for (const p of picks) { const sp = TR.ON() ? TR.speciesAt(ZID, p.x, p.y) : null; const g = sp ? TR.stageYearsOf(sp, CHz.REGROW.TREE_STUMP_Y(), CHz.REGROW.TREE_FULL_Y()) : [CHz.REGROW.TREE_STUMP_Y(), CHz.REGROW.TREE_FULL_Y()]; sapD = Math.min(sapD, Math.ceil(g[0] * YD)); }
  const dayLater = dayNow + (Number.isFinite(sapD) ? sapD : 0);
  clock(dayLater);
  for (const p of picks) {
    if (!p.afterCut) continue;
    ev.stage.n++;
    const c = cmpCell(p.x, p.y, dayLater);
    if (c.ok) ev.stage.same++;
    if (J(c.R) !== p.afterCut) ev.stage.changed++;
  }
  //   되살린다 — T341 문(`_t341Unharvest` · 자리는 모른다 → 그 청크 판을 버린다)
  for (const p of picks) {
    if (!p.afterCut) continue;
    const before = J(CHz.resourcesAtCell(ZID, p.x, p.y, { biome: bz, chunkSize: csz, harvestedSet: H.harvestedSeeds, gameDay: dayLater }));
    if (!H._t341Unharvest(p.seedKey)) continue;
    ev.unh.n++;
    const c = cmpCell(p.x, p.y, dayLater);
    if (c.ok) ev.unh.same++;
    if (J(c.R) !== before) ev.unh.changed++;
  }
  //   심는다 — 마을 셋의 고리에서 빈 셀 하나씩(DB 나무 · 색인은 그대로여야 한다 · 제품 문은 심은 묘목을 낸다)
  for (let i = 0; i < R.length && ev.plant.n < 3; i++) {
    const xy = R[i].xy;
    for (let j = 0; j < xy.length; j += 2) {
      const x = xy[j], y = xy[j + 1]; if (x < 0 || y < 0) continue;
      const px = x * 32 + 16, py = y * 32 + 16;
      if (H.isTerrainBlockedLocal(px, py)) continue;
      if (CHz.resourcesAtCell(ZID, x, y, { biome: bz, chunkSize: csz }).length) continue;
      let busy = false; for (const rr of H.resources.values()) if (Math.floor(rr.x / 32) === x && Math.floor(rr.y / 32) === y) { busy = true; break; }
      if (busy) continue;
      const idxBefore = J(H._idxAtCell(x, y, false, dayLater));
      me.x = px; me.y = py; me.inventory.acorn = 1;
      const t = H.tryPlantTree(me, px, py, 'acorn');
      if (!t) continue;
      ev.plant.n++;
      await new Promise((r) => setTimeout(r, 400));   // 쿼드트리는 틱이 다시 세운다(5Hz 상한 — 종전 규칙 그대로)
      if (J(H._idxAtCell(x, y, false, dayLater)) === idxBefore && cmpCell(x, y, dayLater).ok1) ev.plant.idxSame++;
      const a = H._t325TreesAtCell(x, y);
      if (a.length && a[0].id === t.id) ev.plant.product++;
      break;
    }
  }
  res.events = ev;
  say(`③ 사건 — 벰 ${ev.cut.n}(답이 바뀐 셀 ${ev.cut.changed} · 판 = 색인 ${ev.cut.same}) · 날 넘김 ${dayNow} → ${dayLater}일 ${ev.stage.n}(바뀐 셀 ${ev.stage.changed} · 같음 ${ev.stage.same}) · 되살림 ${ev.unh.n}(바뀐 셀 ${ev.unh.changed} · 같음 ${ev.unh.same}) · 심음 ${ev.plant.n}(색인 그대로 ${ev.plant.idxSame} · 제품 문이 심은 묘목을 냄 ${ev.plant.product})`);
  const allSame = (res.same.badLedger + res.same.badRaw + res.same.badProduct) === 0 && ev.cut.same === ev.cut.n && ev.stage.same === ev.stage.n && ev.unh.same === ev.unh.n && ev.plant.idxSame === ev.plant.n && ev.plant.product === ev.plant.n;
  res.verdict = allSame ? 'SAME' : 'DIFF';
  say(`판정 — ${allSame ? '★셀 답 비트 동일(사건 뒤까지)' : '✗ 어긋났다(위 수)'} · 판 ${H._ringCache.size} · 낳음 ${H._ringStat.miss} · 셀만 새로 ${H._ringStat.patch} · 판 버림 ${H._ringStat.drop}`);
  fs.writeFileSync(OUTZ, JSON.stringify(res, null, 1));
  say(`표 → ${OUTZ}`);
}
