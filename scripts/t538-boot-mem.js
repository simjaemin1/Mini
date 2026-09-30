#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T538 ① 자)
// =============================================================================
// T538 ① — **부팅이 살아 있는 DB 를 통째로 삼키나**: 서울 한반도 존이 부팅 178초쯤 힙 978MB 에서 죽었다(restart 272).
//   이 자는 DB **사본**으로 부팅을 재현하고, 단계마다 `heapUsed` 를 적는다(제품 0 — preload 가 `console.log` · sqlite 문장만 엿본다).
//
//   node scripts/t538-boot-mem.js --rows <db>                         ← `village_buildings` type 별 · 마을별 · 중복 · terr × 반지름 × 하루 성장(#93 자료)
//   node scripts/t538-boot-mem.js --boot <db> [heapMB] [out.json]     ← 사본의 사본으로 존을 띄운다(heapMB 기본 1000 = 서울 978MB 판)
//     env: T538_TREE(존 코드 나무 · 기본 이 레포) · T538_PORT(4900) · T538_DUMP(1 = 마을 상태 집합 지문을 out 에 싣는다)
//   out: { died, exit, heapMax, rssMax, upS, stages:[{t, heap, rss, line}], vil:[{i, rows, heap}], dump }
//
//   단계 = 존이 이미 찍는 부팅 로그 줄(해안선 · 지형 메모 · 시드 자원 · mob · 건축물 · econ · 마을 · 도로 · 게시판 · 영토 · 도적 · up) —
//   preload 가 그 줄이 찍히는 **순간**의 `process.memoryUsage()` 를 붙인다. 50ms 표본기가 그 사이 최고를 잡는다.
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');

// ───────────────────────────── 존 안(preload) ─────────────────────────────
if (process.env.T538_CHILD) {
  const OUT = process.env.T538_CHILD;
  const T0 = Date.now();
  const rec = { stages: [], vil: [], heapMax: 0, rssMax: 0, heapMaxAt: '', dump: null };
  let lastLine = '(시작)';
  const mu = () => process.memoryUsage();
  const flush = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
  const samp = () => { const m = mu(); if (m.heapUsed > rec.heapMax) { rec.heapMax = m.heapUsed; rec.heapMaxAt = lastLine; } if (m.rss > rec.rssMax) rec.rssMax = m.rss; };
  setInterval(samp, 50).unref();
  setInterval(flush, 1000).unref();
  const _log = console.log, _warn = console.warn, _err = console.error;
  const tap = (orig) => function (...a) {
    try {
      const line = a.map((x) => (typeof x === 'string' ? x : '')).join(' ').replace(/\s+/g, ' ').slice(0, 110);
      if (line.trim()) { const m = mu(); samp(); lastLine = line; rec.stages.push({ t: Date.now() - T0, heap: m.heapUsed, rss: m.rss, line }); flush();   // ★부팅은 동기라 타이머가 안 돈다 — 줄마다 적는다(OOM 은 exit 훅도 안 부른다)
        if (process.env.T538_DUMP && /🕐 경도 시차/.test(line) && globalThis.__t538 && !rec.dump) rec.dump = dumpVillages(); }
    } catch (e) {}
    return orig.apply(this, a);
  };
  console.log = tap(_log); console.warn = tap(_warn); console.error = tap(_err);
  // 마을별 — `village_buildings` 를 마을 하나씩 읽는 문장이 끝날 때마다(종전 `SELECT *` · 새 좌표 조회 둘 다)
  try {
    const sq = require('node:sqlite'); const DP = sq.DatabaseSync.prototype; const _prep = DP.prepare; let patched = false;
    DP.prepare = function (sql) {
      const st = _prep.call(this, sql);
      if (!patched) { patched = true; const SP = Object.getPrototypeOf(st); const _all = SP.all, _iter = SP.iterate;
        SP.all = function (...a) { const r = _all.apply(this, a); try { const s = this.sourceSQL || ''; if (/FROM village_buildings WHERE village_id = \?/.test(s)) { samp(); rec.vil.push({ sql: s.slice(0, 60), rows: r.length, heap: mu().heapUsed }); flush(); } } catch (e) {} return r; };
        if (_iter) SP.iterate = function (...a) { const it = _iter.apply(this, a); try { const s = this.sourceSQL || ''; if (/FROM village_buildings WHERE village_id = \?/.test(s)) rec.vil.push({ sql: s.slice(0, 60), rows: -1, heap: mu().heapUsed }); } catch (e) {} return it; }; }
      return st;
    };
  } catch (e) {}
  // 상태 집합 지문 — 마을 적재 직후(경도 시차 줄) 한 번 · villages.js 가 실릴 때 끝에 `state` 를 내준다(t523-hunt-same 문법)
  if (process.env.T538_DUMP) {
    const Module = require('module'); const _c = Module.prototype._compile; const VJS = path.join('server', 'villages.js');
    Module.prototype._compile = function (content, filename) { if (filename.endsWith(VJS)) content += '\n;globalThis.__t538 = { state };\n'; return _c.call(this, content, filename); };
  }
  function dumpVillages() {
    const crypto = require('crypto'); const st = globalThis.__t538.state; const out = [];
    const hs = (arr) => crypto.createHash('sha256').update(arr.join('|')).digest('hex').slice(0, 16);
    const keys = (s) => [...(s || [])].map(String).sort();
    const cells = (a) => (a || []).map((c) => c.cx + ',' + c.cy + (c.data != null ? ':' + c.data : '')).sort();
    for (const v of st.villages || []) {
      const o = { id: v.dbId, name: v.name };
      //   H = 모인 것(정렬) · O = **넣은 순서 그대로**(Set 의 순회 순서가 뒤 계산의 동점에 닿는다 — 순서까지 같아야 "같은 상태")
      for (const [k, s] of [['terr', v._terrSet], ['pot', v._potSet], ['farm', v._farmSet], ['dry', v._drySet]]) { const K = keys(s); o[k] = K.length; o[k + 'H'] = hs(K); o[k + 'O'] = hs([...(s || [])].map(String)); }
      for (const [k, a] of [['gran', v._granList], ['house', v._houseCells], ['ditch', v._ditch], ['phouse', v._pHouses], ['psite', v._pSiteRows]]) { const K = cells(a); o[k] = K.length; o[k + 'H'] = hs(K);
        o[k + 'O'] = hs((a || []).map((c) => c.cx + ',' + c.cy + (c.data != null ? ':' + c.data : ''))); }
      o.housesPx = hs((v.housesPx || []).map((p) => p.x + ',' + p.y));
      o.pend = v._pendSite ? v._pendSite.cx + ',' + v._pendSite.cy : null;
      o.shelter = v._shelter ? v._shelter.cx + ',' + v._shelter.cy : null;
      o.farmN = v._farmN; o.dryN = v._dryN; o.maxRPx = v._maxRPx; o.bnd = v._bnd ? hs(v._bnd.map(String)) : null; o.tribe = v._tribeId;
      out.push(o);
    }
    return out;
  }
  process.on('exit', () => { samp(); flush(); });
  return;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MB = (b) => Math.round(b / 1048576);

// ───────────────────────────── 행 수 표 ─────────────────────────────
if (process.argv[2] === '--rows') {
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(process.argv[3], { readOnly: true });
  const q = (s, ...a) => d.prepare(s).all(...a);
  const tabs = q("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
  console.log('[표별 행]'); for (const t of tabs) { try { console.log(`  ${t.padEnd(24)} ${q(`SELECT COUNT(*) n FROM "${t}"`)[0].n}`); } catch (e) {} }
  const byType = q('SELECT type, COUNT(*) n, SUM(LENGTH(data)) b FROM village_buildings GROUP BY type ORDER BY n DESC');
  const tot = byType.reduce((s, r) => s + r.n, 0);
  console.log(`\n[village_buildings type 별] 합 ${tot}`); for (const r of byType) console.log(`  ${r.type.padEnd(12)} ${String(r.n).padStart(9)} (${(100 * r.n / tot).toFixed(1)}%) · data ${r.b || 0}B`);
  const dup = q('SELECT village_id, type, cx, cy, COUNT(*) c, GROUP_CONCAT(id) ids FROM village_buildings GROUP BY 1,2,3,4 HAVING c > 1');
  console.log(`\n[중복 (village_id,type,cx,cy)] ${dup.length}묶음 · 지울 행 ${dup.reduce((s, r) => s + r.c - 1, 0)} — ${dup.slice(0, 10).map((r) => `${r.village_id}/${r.type}/${r.cx},${r.cy}×${r.c}[${r.ids}]`).join(' · ')}`);
  // 마을별 terr × 반지름 × 하루 성장
  const vils = q('SELECT id, name, cx, cy, day, created_at FROM villages ORDER BY id');
  const rows = [];
  for (const v of vils) {
    const t = q("SELECT COUNT(*) n, MIN(created_at) c0, MAX(created_at) c1 FROM village_buildings WHERE village_id = ? AND type = 'terr'", v.id)[0];
    const all = q('SELECT COUNT(*) n FROM village_buildings WHERE village_id = ?', v.id)[0].n;
    const rr = q("SELECT cx, cy FROM village_buildings WHERE village_id = ? AND type = 'terr'", v.id);
    let rmax = 0, r2 = 0; for (const c of rr) { const r = Math.hypot(c.cx - v.cx, c.cy - v.cy); if (r > rmax) rmax = r; r2 += r * r; }
    const rrms = rr.length ? Math.sqrt(r2 / rr.length) : 0;
    const discR = Math.sqrt(t.n / Math.PI);   // 같은 넓이 원의 반지름
    rows.push({ id: v.id, name: v.name, day: v.day, all, terr: t.n, rmax: +rmax.toFixed(0), discR: +discR.toFixed(0), perDay: v.day ? +((t.n - 3450) / v.day).toFixed(2) : null, spanDays: t.c1 && t.c0 ? +((t.c1 - t.c0) / 86400000).toFixed(1) : null });
  }
  rows.sort((a, b) => b.terr - a.terr);
  const tv = rows.map((r) => r.terr); const avg = tv.reduce((s, x) => s + x, 0) / tv.length;
  console.log(`\n[마을별 terr] ${rows.length}곳 · 최소 ${Math.min(...tv)} · 최대 ${Math.max(...tv)} · 평균 ${avg.toFixed(0)} · 합 ${tv.reduce((s, x) => s + x, 0)}`);
  console.log('  마을            day   전 행   terr  최대반지름  같은넓이원R  (terr−3450)/day  행 생성 폭(실일)');
  for (const r of rows) console.log(`  ${String(r.name).padEnd(12)} ${String(r.day).padStart(5)} ${String(r.all).padStart(7)} ${String(r.terr).padStart(6)} ${String(r.rmax).padStart(8)} ${String(r.discR).padStart(10)} ${String(r.perDay).padStart(12)} ${String(r.spanDays).padStart(12)}`);
  if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify({ tabs, byType, dup, rows }, null, 1));
  process.exit(0);
}

// ───────────────────────────── 부팅 ─────────────────────────────
if (process.argv[2] === '--boot') {
  const { spawn } = require('child_process');
  const SRC = process.argv[3]; const HEAP = parseInt(process.argv[4] || '1000', 10); const OUT = process.argv[5] || '/tmp/t538/boot.json';
  const TREE = process.env.T538_TREE || path.join(__dirname, '..');
  const PORT = parseInt(process.env.T538_PORT || '4900', 10);
  const TMP = path.join(path.dirname(OUT), 'bootdb-' + process.pid); fs.mkdirSync(TMP, { recursive: true });
  const zdb = path.join(TMP, 'z.db'), cdb = path.join(TMP, 'c.db');
  if (SRC && SRC !== 'new') { fs.copyFileSync(SRC, zdb); try { fs.copyFileSync(SRC + '-wal', zdb + '-wal'); } catch (e) {} fs.chmodSync(zdb, 0o644); try { fs.chmodSync(zdb + '-wal', 0o644); } catch (e) {} }
  const rec = path.join(TMP, 'rec.json'); const logf = path.join(TMP, 'zone.log');
  const SECRET = 't538-' + process.pid;
  (async () => {
    const c = spawn(process.execPath, [path.join(TREE, 'server/central.js')], { cwd: TREE, stdio: 'ignore',
      env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: cdb, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
    const lf = fs.openSync(logf, 'w');
    const t0 = Date.now();
    const z = spawn(process.execPath, [`--max-old-space-size=${HEAP}`, '-r', __filename, path.join(TREE, 'server/zone.js')], { cwd: TREE, stdio: ['ignore', lf, lf],
      env: Object.assign({}, process.env, { T538_CHILD: rec, PORT: String(PORT + 10), ZONE_ID: 'hanbando', DB_PATH: zdb, CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(PORT), CENTRAL_SECRET: SECRET,
        ENABLE_VILLAGES: '1', NODE_OPTIONS: '' }) });
    let exit = null; z.on('exit', (code, sig) => { exit = { code, sig }; });
    let up = null;
    for (let i = 0; i < 1200 && !exit; i++) { try { if ((await fetch(`http://localhost:${PORT + 10}/health`)).ok) { up = Date.now() - t0; break; } } catch (e) {} await sleep(1000); }
    if (up) await sleep(parseInt(process.env.T538_AFTER_MS || '5000', 10));
    // ★[T538 추신3 ⓑ] `T538_PERF_WIN=n` · `T538_PERF_S=s` — up 뒤 s초 창 n개 동안 틱 p50/p95/max · 빚 버림 · 루프를 `/perf?reset=1` 로(안 문 · 비밀 헤더)
    const perf = [];
    if (up && process.env.T538_PERF_WIN) {
      const getj = async (q) => { try { return await (await fetch(`http://localhost:${PORT + 10}/perf${q}`, { headers: { 'x-zone-secret': SECRET } })).json(); } catch (e) { return null; } };
      await getj('?reset=1');
      for (let w = 0; w < parseInt(process.env.T538_PERF_WIN, 10) && !exit; w++) {
        await sleep(parseInt(process.env.T538_PERF_S || '30', 10) * 1000);
        const P = await getj('?reset=1'); if (!P || !P.tick) { perf.push(null); continue; }
        const T = P.tick; perf.push({ w, n: T.ms && T.ms.n, p50: T.ms && T.ms.p50, p95: T.ms && T.ms.p95, max: T.ms && T.ms.max, lagPct: T.lagPct,
          dropN: T.dropN, dropped: T.dropped, clipped: T.clipped, loop: P.loop ? { p95: P.loop.p95, max: P.loop.max } : null });
        console.log(`  [perf ${w}] 틱 n ${T.ms && T.ms.n} · p50 ${T.ms && T.ms.p50} · p95 ${T.ms && T.ms.p95} · max ${T.ms && T.ms.max} · lag ${T.lagPct}% · 빚 버림 ${T.dropN}(누적)`);
      }
    }
    try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {}
    await sleep(800);
    let R = {}; try { R = JSON.parse(fs.readFileSync(rec, 'utf8')); } catch (e) {}
    const log = fs.readFileSync(logf, 'utf8');
    const died = !up;
    const fatal = (log.match(/FATAL ERROR[^\n]*/) || [null])[0];
    const res = { src: SRC, heap: HEAP, tree: TREE, died, exit, fatal, upS: up ? +(up / 1000).toFixed(1) : null, heapMax: MB(R.heapMax || 0), heapMaxAt: R.heapMaxAt, rssMax: MB(R.rssMax || 0),
      perf, stages: (R.stages || []).map((s) => ({ t: +(s.t / 1000).toFixed(1), heap: MB(s.heap), rss: MB(s.rss), line: s.line })), vil: (R.vil || []).map((v) => ({ rows: v.rows, heap: MB(v.heap), sql: v.sql })), dump: R.dump || null };
    fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
    fs.copyFileSync(logf, OUT.replace(/\.json$/, '') + '.log');
    for (const f of fs.readdirSync(TMP)) { try { fs.unlinkSync(path.join(TMP, f)); } catch (e) {} } try { fs.rmdirSync(TMP); } catch (e) {}
    console.log(`[T538 ①] ${SRC} · 힙 상한 ${HEAP}MB · ${died ? `**죽음** ${fatal || JSON.stringify(exit)}` : `up ${res.upS}초`} · heapUsed 최고 ${res.heapMax}MB(그때 마지막 줄: ${res.heapMaxAt}) · RSS 최고 ${res.rssMax}MB`);
    process.exit(0);
  })();
  return;
}
console.log('쓰는 법: --rows <db> [out.json] | --boot <db|new> [heapMB] [out.json]');
