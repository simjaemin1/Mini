#!/usr/bin/env node
// === scripts/t573-kind-run.js — 새 세계 N 일 · 답압 도장 **종류별** 계수 [T573 ① · 2026-10-03] ======================
//
// ★묻는 것: 길 셀을 밟은 몸이 누구인가(캐러밴 · 호위 · 행군 · 주민 · 사냥꾼 · 사람). 사본 `roads` 는 (v, d) 만 있어 못 가른다.
//   ⇒ 새 세계(시딩 · 관측자 0 = 산 서버 대부분의 시간)를 `VILLAGE_DAY_MS` 로 N 일 돌리고, 적재 순간 계수기
//     (`scripts/t573-stamp-kind.js` · 존 코드 0)가 도장마다 부른 쪽을 센다. 끝에 존의 `roads` 표(같은 세계의 길)와 겹친다.
// ★재기만 한다 — 제품 코드 0 · 러너 밖.
// 실행: node scripts/t573-kind-run.js [--days 30] [--day-ms 20000] [--out /tmp/t573-kind.json] [--keep-db /tmp/x.db]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const DAYS = +val('--days', '30'), DAYMS = val('--day-ms', '20000'), OUT = val('--out', '/tmp/t573-kind.json');
const KEEP = val('--keep-db', null);   // ★[T578] 끝난 존 DB 를 남긴다(길·교역로 표를 `t578-road-measure` 로 잰다)
const CPORT = +val('--cport', '3717'), ZPORT = +val('--zport', '3727');
const ZDB = `/tmp/t573k-zone-${process.pid}.db`, CDB = `/tmp/t573k-central-${process.pid}.db`;
const STAMP = OUT.replace(/\.json$/, '') + '.stamp.json';
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, ['--max-old-space-size=1500', path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jget = async (u) => { try { return await (await fetch(u, { signal: AbortSignal.timeout(30000) })).json(); } catch (e) { return null; } };
(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`, VILLAGE_DAY_MS: DAYMS,
    NODE_OPTIONS: `--require ${path.join(ROOT, 'scripts', 't573-stamp-kind.js')}`, T573_STAMP_OUT: STAMP });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 900000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  let d0 = null, last = null;
  const tEnd = Date.now() + (DAYS + 3) * (+DAYMS) + 300000;
  while (Date.now() < tEnd) {
    await sleep(5000);
    const p = await jget(`http://localhost:${ZPORT}/perf`);
    const L = p && p.econTick && p.econTick.last;
    if (L && L.day != null) { if (d0 == null) d0 = L.day; if (L.day !== last) { last = L.day; if ((L.day - d0) % 5 === 0) console.log(`  하루 ${L.day - d0}/${DAYS}`); } if (L.day - d0 >= DAYS) break; }
  }
  await sleep(6000);   // 계수기 5초 저장 한 번 더
  z.kill('SIGTERM'); await sleep(4000);
  const K = JSON.parse(fs.readFileSync(STAMP, 'utf8'));
  const cells = JSON.parse(fs.readFileSync(STAMP.replace(/\.json$/, '') + '.cells.json', 'utf8'));
  // 존 표의 길(같은 세계) — 등급 셀이 어느 종류의 도장 집합에 드나
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(ZDB, { readOnly: true });
  const rows = db.prepare("SELECT cell_key k, v FROM roads WHERE zone='hanbando'").all(); db.close();
  const sets = Object.fromEntries(Object.entries(cells).map(([k, a]) => [k, new Set(a)]));
  const share = {};
  for (const thr of [1, 8, 28]) {
    const g = rows.filter((r) => r.v >= thr); const o = { cells: g.length };
    for (const [kd, s] of Object.entries(sets)) o[kd] = g.filter((r) => s.has(r.k)).length;
    o.only_caravan_escort = g.filter((r) => (sets.caravan && sets.caravan.has(r.k) || sets.escort && sets.escort.has(r.k)) && !Object.entries(sets).some(([kd, s]) => kd !== 'caravan' && kd !== 'escort' && s.has(r.k))).length;
    share['v>=' + thr] = o;
  }
  const res = { at: new Date().toISOString(), days: last - d0, dayMs: +DAYMS, kinds: K.kinds, roads: share };
  fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  if (KEEP) { for (const suf of ['', '-wal', '-shm']) { try { fs.copyFileSync(ZDB + suf, KEEP + suf); } catch (e) {} } console.log('존 DB →', KEEP); }
  for (const f of [ZDB, CDB]) for (const suf of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + suf); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
