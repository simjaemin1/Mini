#!/usr/bin/env node
// === scripts/t573-route-live.js — 존이 지금 교역로를 팔 때 답압 길 할인(§16)이 먹는가 [T573 ② · 2026-10-03] ============
//
// ★묻는 것: 사본(서울 0930)의 `trade_routes.pts` 1,219쌍은 **길 할인 없이 판 길**과 95.6% 비트 같다(보고 T573 §2 — 재계산 자 recomp).
//   그게 "그때 길이 없었다"인지 "존이 할인을 안 건다"인지 가르려고, 사본의 교역로 표만 비운 사본으로 **존을 띄워**
//   선계산(`_routeWarmStep` · 마을마다 가까운 20곳)이 새로 판 길을 표에서 읽는다.
// ★시계는 사본의 마지막 길 저장일(`roads.d` 최대)로 당긴다(T455 시계) — 길의 감쇠가 사본 그대로라 재계산 자와 같은 길 등급을 본다.
// ★재기만 한다 — 제품 코드 0 · 사본 무접촉(/tmp 복사본의 `trade_routes` 행만 지운다) · 러너 밖.
// 실행: node scripts/t573-route-live.js --db <사본.db> [--min 8] [--out /tmp/t573-live.json]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const SRC = val('--db', null), MIN = +val('--min', '8'), OUT = val('--out', '/tmp/t573-live.json');
const CPORT = +val('--cport', '3719'), ZPORT = +val('--zport', '3729');
if (!SRC || !fs.existsSync(SRC)) { console.log('사본이 없다 — --db <사본.db>'); process.exit(2); }
const ZDB = `/tmp/t573l-zone-${process.pid}.db`, CDB = `/tmp/t573l-central-${process.pid}.db`;
for (const suf of ['', '-wal', '-shm']) if (fs.existsSync(SRC + suf)) { fs.copyFileSync(SRC + suf, ZDB + suf); fs.chmodSync(ZDB + suf, 0o644); }
const { DatabaseSync } = require('node:sqlite');   // 존과 같은 드라이버
let dMax;
{ const d = new DatabaseSync(ZDB); dMax = d.prepare("SELECT MAX(d) m FROM roads WHERE zone='hanbando'").get().m; const n = d.prepare("DELETE FROM trade_routes WHERE zone='hanbando'").run().changes; d.close(); console.log(`사본 복사 · 교역로 ${n}행 비움 · 길 마지막 저장일 ${dMax}`); }
const ZC = require(path.join(ROOT, 'server', 'zone-config'));
const AT = (ZC.WORLD.worldEpoch || 0) + dMax * ZC.WORLD.dayLengthMs + 60000;
const CLK = { NODE_OPTIONS: `--require ${path.join(ROOT, 'scripts', 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(AT) };
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, ['--max-old-space-size=1500', path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, CLK, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (b) => { const s = String(b); if (/교역로|답압 길 준비/.test(s)) process.stdout.write('  [zone] ' + s.split('\n').filter((l) => /교역로|답압 길 준비/.test(l)).join('\n  [zone] ') + '\n'); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}` });
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 900000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  console.log(`up · ${MIN}분 기다린다(선계산 = 부팅 30초 뒤 250ms 간격)`);
  await sleep(MIN * 60000);
  for (const p of procs) { try { p.kill('SIGTERM'); } catch (e) {} }
  await sleep(3000);
  const d = new DatabaseSync(ZDB, { readOnly: true });
  const rows = d.prepare("SELECT pair, pts FROM trade_routes WHERE zone='hanbando'").all();
  d.close();
  const out = {}; for (const r of rows) out[r.pair] = r.pts ? JSON.parse(r.pts) : null;
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), clockAt: AT, dMax, n: rows.length, routes: out }));
  console.log(`새로 판 교역로 ${rows.length}쌍 → ${OUT}`);
  for (const f of [ZDB, CDB]) for (const suf of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + suf); } catch (e) {} }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
