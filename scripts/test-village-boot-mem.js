#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-village-boot-mem.js — 부팅이 살아 있는 DB 를 통째로 삼키지 않는다 [T538 2026-09-30] ============
//
// ★사건: 서울 한반도 존이 부팅 178초쯤 `FATAL ERROR: Reached heap limit`(978MB)로 죽고 다시 떴다(restart 272).
//   8주 산 DB 의 `village_buildings` 154만 행(78% `terr`)을 부팅이 마을마다 `SELECT *` 로 JS 객체로 올려
//   50마을치를 실물화 끝까지 쥐었다(`_bRows`). T538 이 읽는 자리를 나눴다(`eachVillageCell` · `getVillageStructAll` · `getVillageFarthest`).
//
// ★이 하네스가 재는 것
//   ① **살찐 DB**(씨앗 세계 + 마을마다 영토 행을 서울 평균만큼 · 합 ~120만 행)로 존을 힙 상한 1000MB 로 띄운다(서울 978MB 판)
//      — 뜬다 · 부팅 heapUsed 최고 < 600MB.
//   ② 마을 50 의 **상태 집합이 종전 로드와 같다** — 종전 루프(`SELECT *` 전 행 → 갈래)를 **이 하네스 안에서 그대로** 한 번 더 돌려
//      마을마다 대조한다: terr · nongzone · 논밭(farm) · 밭(dry) — 모인 것(정렬 지문)과 **넣은 순서**(순서 지문) 둘 다 ·
//      곳간 · 집 · 도랑 · 의뢰집 · 의뢰 집터 · 집 픽셀 · 진행 중 집터 · 쉼터 · 논밭 수 · 반지름(px) · 경계 · 길드.
//   ③ 씨앗 세계 그대로(부풀리지 않은 판)도 같은 대조.
//   ④ 자명 통과 금지 — ⓐ 종전 로드가 살찐 DB 를 쥐면 600MB 를 **넘는다**(이 자의 문턱이 무는 판이 실제로 있다)
//      ⓑ 종전 지문에서 영토 한 칸을 빼면 대조가 **문다**.
//   ⑤ (있으면) 서울 사본 — env `T538_DB=<사본 db>` 이면 같은 셋을 그 사본으로.
//
// 실행: node scripts/test-village-boot-mem.js        env: T538_DB(서울 사본 · 선택) · TVBM_TERR(살찐 판 마을당 terr · 24000)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const { SEED_Z, ensureSeed } = require('./slicer-seed.js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const HEAP_GATE = 600, HEAP_LIMIT = 1000;
const SZ = 32;   // villages.js 의 셀 px(정본과 같은 값 — 반지름 px 를 종전 식 그대로 재려고)

// ── 종전 로드(T538 이전 `villages.js` 마을 루프 그대로 · 대조군) ───────────────────────────────
//   ★제품 글자를 옮긴 **대조군**이다 — 이 하네스 밖에서 쓰지 않는다. 존은 이제 이 경로를 안 탄다.
function legacyLoad(dbPath) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath);
  const rowsOf = db.prepare('SELECT * FROM village_buildings WHERE village_id = ?');   // 종전 `stmtGetVillageBuildings` 글자 그대로
  const vils = db.prepare("SELECT * FROM villages WHERE zone = ? ORDER BY id").all('hanbando');
  const out = [];
  for (const row of vils) {
    const bRows = rowsOf.all(row.id);
    const housesPx = [];
    const terrSet = new Set(), potSet = new Set(), farmSet = new Set(), drySet = new Set(), granList = [], houseCells = [], siteRows = [], ditchCells = [], pHouseRows = [], pSiteRows = [];
    let farmN = 0, dryN = 0, hallData = null, maxCellR = 4, shelterCell = null;
    for (const b of bRows) {
      const r = Math.hypot(b.cx - row.cx, b.cy - row.cy);
      if (r > maxCellR) maxCellR = r;
      if (b.type === 'house') { housesPx.push({ x: b.cx * SZ + SZ / 2, y: b.cy * SZ + SZ / 2 }); houseCells.push({ cx: b.cx, cy: b.cy }); }
      else if (b.type === 'farmland') { farmN++; farmSet.add(b.cx + ',' + b.cy); }
      else if (b.type === 'dryfield') { dryN++; farmSet.add(b.cx + ',' + b.cy); drySet.add(b.cx + ',' + b.cy); }
      else if (b.type === 'terr') terrSet.add(b.cx + ',' + b.cy);
      else if (b.type === 'nongzone') potSet.add(b.cx + ',' + b.cy);
      else if (b.type === 'granary') granList.push({ cx: b.cx, cy: b.cy });
      else if (b.type === 'housesite') siteRows.push({ cx: b.cx, cy: b.cy });
      else if (b.type === 'phouse') pHouseRows.push({ cx: b.cx, cy: b.cy, data: b.data });
      else if (b.type === 'psitework') pSiteRows.push({ cx: b.cx, cy: b.cy, data: b.data });
      else if (b.type === 'ditch') ditchCells.push({ cx: b.cx, cy: b.cy });
      else if (b.type === 'shelter') shelterCell = { cx: b.cx, cy: b.cy };
      else if (b.type === 'hall' && b.data) { try { hallData = JSON.parse(b.data); } catch {} }
    }
    for (const k of farmSet) potSet.delete(k);
    const bnd = (hallData && Array.isArray(hallData.bnd) && hallData.bnd.length) ? hallData.bnd : null;
    let maxRPx = (maxCellR + 3) * SZ;
    if (bnd) { let m = 0; for (let i = 0; i < bnd.length; i += 3) { const d = Math.hypot(bnd[i], bnd[i + 1]); if (d > m) m = d; } maxRPx = Math.max(maxRPx, (m + 2) * SZ); }
    const _pendSite = siteRows.find(s3 => !houseCells.some(h => h.cx === s3.cx && h.cy === s3.cy)) || null;
    out.push(fingerprint({ dbId: row.id, name: row.name, housesPx, _terrSet: terrSet, _potSet: potSet, _farmSet: farmSet, _drySet: drySet, _granList: granList, _houseCells: houseCells,
      _ditch: ditchCells, _pHouses: pHouseRows, _pSiteRows: pSiteRows, _pendSite, _shelter: shelterCell, _farmN: farmN, _dryN: dryN, _maxRPx: Math.round(maxRPx), _bnd: bnd,
      _tribeId: (hallData && hallData.tribeId != null) ? hallData.tribeId : null }));
  }
  db.close();
  return out;
}
// ★지문 — `scripts/t538-boot-mem.js` 의 존 안 `dumpVillages` 와 **같은 식**(칸 이름·해시 식이 한 글자라도 다르면 대조가 무의미하다)
function fingerprint(v) {
  const hs = (arr) => crypto.createHash('sha256').update(arr.join('|')).digest('hex').slice(0, 16);
  const keys = (s) => [...(s || [])].map(String).sort();
  const cells = (a) => (a || []).map((c) => c.cx + ',' + c.cy + (c.data != null ? ':' + c.data : '')).sort();
  const o = { id: v.dbId, name: v.name };
  for (const [k, s] of [['terr', v._terrSet], ['pot', v._potSet], ['farm', v._farmSet], ['dry', v._drySet]]) { const K = keys(s); o[k] = K.length; o[k + 'H'] = hs(K); o[k + 'O'] = hs([...(s || [])].map(String)); }
  for (const [k, a] of [['gran', v._granList], ['house', v._houseCells], ['ditch', v._ditch], ['phouse', v._pHouses], ['psite', v._pSiteRows]]) { const K = cells(a); o[k] = K.length; o[k + 'H'] = hs(K);
    o[k + 'O'] = hs((a || []).map((c) => c.cx + ',' + c.cy + (c.data != null ? ':' + c.data : ''))); }
  o.housesPx = hs((v.housesPx || []).map((p) => p.x + ',' + p.y));
  o.pend = v._pendSite ? v._pendSite.cx + ',' + v._pendSite.cy : null;
  o.shelter = v._shelter ? v._shelter.cx + ',' + v._shelter.cy : null;
  o.farmN = v._farmN; o.dryN = v._dryN; o.maxRPx = v._maxRPx; o.bnd = v._bnd ? hs(v._bnd.map(String)) : null; o.tribe = v._tribeId;
  return o;
}
const cmpDump = (A, B) => { const diff = []; if (!A || !B || A.length !== B.length) return { n: -1, diff: [`길이 ${A && A.length} vs ${B && B.length}`] };
  for (let i = 0; i < A.length; i++) { const a = A[i], b = B[i]; for (const k of Object.keys(a)) if (a[k] !== b[k]) diff.push(`${a.name}.${k} ${a[k]}≠${b[k]}`); }
  return { n: diff.length, diff: diff.slice(0, 6) }; };

// ── 살찐 DB — 씨앗 세계의 마을마다 영토 행을 바깥 고리로 늘린다(서울 사본 평균 24,127셀 · 셀 중복 0) ──
function buildFat(src, dst, perVil) {
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dst + s); } catch (e) {} }
  for (const s of ['', '-wal']) { try { fs.copyFileSync(src + s, dst + s); fs.chmodSync(dst + s, 0o644); } catch (e) {} }
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dst);
  const vils = db.prepare("SELECT id, cx, cy FROM villages WHERE zone = 'hanbando' ORDER BY id").all();
  const have = db.prepare("SELECT cx, cy FROM village_buildings WHERE village_id = ? AND type = 'terr'");
  const ins = db.prepare("INSERT INTO village_buildings (village_id, type, cx, cy, floors, data, created_at) VALUES (?, 'terr', ?, ?, 0, NULL, ?)");
  let added = 0; const t0 = Date.now();
  db.exec('BEGIN');
  for (const v of vils) {
    const own = new Set(have.all(v.id).map((r) => r.cx + ',' + r.cy));
    for (let R = 1; own.size < perVil && R < 400; R++) {           // 사각 고리를 한 겹씩(안쪽부터 · 이미 있는 칸은 건너뛴다)
      for (let dx = -R; dx <= R && own.size < perVil; dx++) for (const dy of (Math.abs(dx) === R ? rangeInc(-R, R) : [-R, R])) {
        if (own.size >= perVil) break;
        const x = v.cx + dx, y = v.cy + dy, k = x + ',' + y; if (x < 1 || y < 1 || own.has(k)) continue;
        own.add(k); ins.run(v.id, x, y, t0 + added); added++;
      }
    }
  }
  db.exec('COMMIT');
  const n = db.prepare('SELECT COUNT(*) n FROM village_buildings').get().n;
  db.close();
  return { added, total: n, vils: vils.length };
}
function rangeInc(a, b) { const o = []; for (let i = a; i <= b; i++) o.push(i); return o; }

function boot(dbPath, tag) {
  const out = `/tmp/tvbm-${tag}.json`;
  try { fs.unlinkSync(out); } catch (e) {}
  execFileSync(process.execPath, [path.join(__dirname, 't538-boot-mem.js'), '--boot', dbPath, String(HEAP_LIMIT), out],
    { cwd: ROOT, stdio: 'ignore', env: Object.assign({}, process.env, { T538_DUMP: '1', T538_PORT: process.env.TVBM_PORT || '4930', T538_AFTER_MS: '3000' }), timeout: 30 * 60 * 1000 });
  return JSON.parse(fs.readFileSync(out, 'utf8'));
}
// 종전 로드가 쥐는 힙 — 50마을 `SELECT *` 행을 실물화 끝까지 쥐던 그 꼴(자식 · 넉넉한 힙 · gc 뒤 heapUsed)
function legacyHeld(dbPath) {
  const code = `const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(${JSON.stringify(dbPath)});
    const st=db.prepare('SELECT * FROM village_buildings WHERE village_id = ?');const keep=[];
    for(const v of db.prepare("SELECT id FROM villages WHERE zone='hanbando' ORDER BY id").all()) keep.push(st.all(v.id));
    global.gc();global.gc();console.log(JSON.stringify({heap:process.memoryUsage().heapUsed,rows:keep.reduce((s,a)=>s+a.length,0)}));`;
  const r = execFileSync(process.execPath, ['--expose-gc', '--max-old-space-size=4000', '-e', code], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10 * 60 * 1000 });
  return JSON.parse(r.trim().split('\n').pop());
}

function checkCase(label, dbPath) {
  console.log(`\n── ${label} ──`);
  const work = `/tmp/tvbm-ref-${label.replace(/\W/g, '')}.db`;
  for (const s of ['', '-wal']) { try { fs.unlinkSync(work + s); } catch (e) {} try { fs.copyFileSync(dbPath + s, work + s); fs.chmodSync(work + s, 0o644); } catch (e) {} }
  try { fs.unlinkSync(work + '-shm'); } catch (e) {}
  const ref = legacyLoad(work);
  const B = boot(dbPath, label.replace(/\W/g, ''));
  ok(!B.died, `${label} — 힙 상한 ${HEAP_LIMIT}MB 로 **뜬다**(서울 978MB 판)`, B.died ? `죽음 ${B.fatal || JSON.stringify(B.exit)}` : `up ${B.upS}초`);
  ok(B.heapMax > 0 && B.heapMax < HEAP_GATE, `${label} — 부팅 heapUsed 최고 < ${HEAP_GATE}MB`, `${B.heapMax}MB(마지막 줄: ${String(B.heapMaxAt).slice(0, 60)}) · RSS ${B.rssMax}MB`);
  const C = cmpDump(ref, B.dump);
  const tot = ref.reduce((s, v) => s + v.terr, 0);
  ok(ref.length >= 10 && C.n === 0, `${label} — 마을 ${ref.length}곳 상태 집합이 **종전 로드와 같다**(모인 것 · 넣은 순서 · 반지름 · 경계 …)`, C.n === 0 ? `terr 합 ${tot}` : C.diff.join(' / '));
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(work + s); } catch (e) {} }
  return { ref, B };
}

(async () => {
  console.log('\n=== T538 — 부팅 로드가 경계를 갖는다(살찐 DB · 힙 상한 1000MB · 상태 집합 = 종전) ===');
  const r = await ensureSeed();
  if (!r.ok) { console.log(`  ✗ 씨앗 준비 실패 — ${r.why}`); process.exit(1); }
  const PER = parseInt(process.env.TVBM_TERR || '24000', 10);
  const FAT = '/tmp/tvbm-fat.db';
  const F = buildFat(SEED_Z, FAT, PER);
  console.log(`  · 살찐 DB — 씨앗 + 영토 행 ${F.added} · village_buildings 합 ${F.total} · 마을 ${F.vils}(마을당 terr ${PER})`);
  ok(F.total >= 1000000, '[상황] 살찐 DB 가 서울 사본만큼 크다(village_buildings ≥ 100만 행 · 자명 통과 금지)', `${F.total}`);

  const fat = checkCase('살찐 DB', FAT);
  checkCase('씨앗 세계', SEED_Z);

  console.log('\n── 자명 통과 금지 ──');
  const H = legacyHeld(FAT);
  ok(H.heap / 1048576 > HEAP_GATE, `ⓐ 종전 로드(마을 50 \`SELECT *\` 행을 쥔다)는 같은 DB 에서 ${HEAP_GATE}MB 를 **넘는다** — 문턱이 무는 판이 실제로 있다`, `${Math.round(H.heap / 1048576)}MB · ${H.rows}행`);
  { const bad = JSON.parse(JSON.stringify(fat.ref)); bad[0].terr -= 1; bad[0].terrH = 'x';
    ok(cmpDump(bad, fat.B.dump).n > 0, 'ⓑ 종전 지문에서 영토 한 칸을 빼면 대조가 **문다**'); }
  { const bad = JSON.parse(JSON.stringify(fat.ref)); const i = bad.findIndex((v) => v.farm > 1); if (i >= 0) bad[i].farmO = 'y';
    ok(i >= 0 && cmpDump(bad, fat.B.dump).n > 0, 'ⓒ 모인 것은 같고 **넣은 순서만** 다른 판도 문다(순서 지문)'); }

  if (process.env.T538_DB) {
    if (fs.existsSync(process.env.T538_DB)) checkCase('서울 사본', process.env.T538_DB);
    else ok(false, `T538_DB 가 가리키는 사본이 없다 — ${process.env.T538_DB}`);
  } else console.log('\n  · (서울 사본 판은 env `T538_DB=<사본 db>` 일 때만 — 보고 T538 §① 에 그 판 수치)');

  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(FAT + s); } catch (e) {} }
  console.log(`\n=== ${pass} 통과 / ${fail} 실패 ===\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
