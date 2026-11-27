#!/usr/bin/env node
// (@regress 없음 — T1493 계측 · 러너 밖) 라이브 사본 부팅 — 옛 DB(칸 행)를 켬이 구역 행으로 옮기는 초 · 끔 부팅이 되돌리나(행 그대로)
//   길 모듈(`server/roads.js`)을 존과 같은 문으로 띄운다(아이 프로세스마다 새 장부 · 길의 날 = 사본의 가장 늦은 날 — 꺼진 사이 감쇠 0 · 날 죄기 0):
//     ⓪ 처음 칸 행 지문(키 · 값 · 날 — 칸 키 오름 sha1) · ① 켬 부팅(이관 한 거래 · 초) · ② 켬 다시 부팅(구역 행만) · ③ 끔 부팅(되돌림 한 거래 · 초) ·
//     ④ 되돌린 칸 행 지문 = ⓪ · welcome 길 목록(`clientRoads` 모음) 지문 = ⓪ 의 끔 부팅 · DB quick_check
//   쓰는 법: node 계측/T1493_2026-11-27/t1493-revert.js <world.db 사본> <out.json> [--zone hanbando]
'use strict';
const path = require('path'), fs = require('fs'), crypto = require('crypto'), { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf('--' + k); return i >= 0 ? A[i + 1] : d; };
const ZONE = opt('zone', 'hanbando');
if (process.env.T1493_RV_CHILD) {   // 아이 — 길 모듈 부팅 하나
  const DB = process.env.DB_PATH, day = +process.env.T1493_RV_DAY;
  const quiet = (f) => { const l = console.log; console.log = () => {}; try { return f(); } finally { console.log = l; } };
  const logs = []; const l0 = console.log; console.log = (...a) => logs.push(a.join(' '));
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
  const Z = ZONES[ZONE], cellsW = Math.ceil(Z.zoneWidth / 32), cellsH = Math.ceil(Z.zoneHeight / 32);
  const R = require(path.join(ROOT, 'server', 'roads'));
  R.setEconDay(() => day);
  const t0 = Date.now(); R.init({ zoneId: ZONE, cellsW, cellsH, epoch: 0, dayMs: 1440000, broadcast: null }); const initMs = Date.now() - t0;
  const c = R.clientRoads() || [], keys = []; for (let i = 0; i < c.length; i += 3) keys.push(c[i + 1] * cellsW + c[i] + ':' + c[i + 2]);
  keys.sort();
  console.log = l0;
  process.stdout.write('@@RV ' + JSON.stringify({ initMs, cells: R._S.cells.size, graded: keys.length, clientHash: crypto.createHash('sha1').update(keys.join(',')).digest('hex').slice(0, 12), boot: R._S.t1448Boot || null, log: logs.filter((x) => /T1448|답압 길 준비/.test(x)).slice(0, 4) }) + '\n');
  process.exit(0);
}
const SRC = A[0], OUT = A[1];
const { DatabaseSync } = require('node:sqlite');
const rowsHash = (db) => { const d = new DatabaseSync(db, { readOnly: true }); const h = crypto.createHash('sha1'); let n = 0, mx = 0;
  for (const r of d.prepare('SELECT cell_key, v, d FROM roads WHERE zone = ? ORDER BY cell_key').iterate(ZONE)) { h.update(r.cell_key + ':' + r.v + ':' + r.d + ','); n++; if (r.d > mx) mx = r.d; }
  const ch = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='road_chunks'").get() ? d.prepare('SELECT COUNT(*) n FROM road_chunks WHERE zone = ?').get(ZONE).n : 0;
  const qc = d.prepare('PRAGMA quick_check').get(); d.close(); return { n, maxD: mx, chunks: ch, hash: h.digest('hex').slice(0, 12), ok: Object.values(qc)[0] }; };
const child = (db, on, day) => { const r = spawnSync(process.execPath, ['--experimental-sqlite', __filename, '--zone', ZONE], { cwd: ROOT, env: { ...process.env, T1493_RV_CHILD: '1', DB_PATH: db, ZONE_ID: ZONE, T1448_ROAD_GRID: on ? '1' : '0', T1493_RV_DAY: String(day) }, encoding: 'utf8', maxBuffer: 1 << 26 });
  const line = String(r.stdout || '').split('\n').find((l) => l.startsWith('@@RV ')); return line ? JSON.parse(line.slice(5)) : { err: String(r.stderr || '').slice(-500) }; };
const out = { src: path.basename(SRC), at: new Date().toISOString() };
const db = path.join(require('os').tmpdir(), `t1493rv-${process.pid}.db`);
for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(db + s); } catch (e) {}
fs.copyFileSync(SRC, db);
out.orig = rowsHash(db);
const day = out.orig.maxD | 0;
out.off0 = child(db, false, day);   // 끔 부팅(옛 DB 그대로 — 되돌릴 것 없음) — welcome 길 지문의 정답
out.on1 = child(db, true, day); out.after1 = rowsHash(db);   // 켬 첫 부팅 = 이관
out.on2 = child(db, true, day); out.after2 = rowsHash(db);   // 켬 다시
out.off1 = child(db, false, day); out.after3 = rowsHash(db);   // 끔 = 되돌림
out.on3 = child(db, true, day);   // 되돌린 DB 를 다시 켬 — 다시 이관
out.verdict = {
  migrated: out.after1.n === 0 && out.after1.chunks > 0, rowsBack: out.after3.hash === out.orig.hash && out.after3.n === out.orig.n && out.after3.chunks === 0,
  sameClient: [out.on1, out.on2, out.off1, out.on3].every((x) => x.clientHash === out.off0.clientHash), quick: [out.after1, out.after2, out.after3].every((x) => x.ok === 'ok'),
};
for (const s of ['', '-wal', '-shm']) try { fs.unlinkSync(db + s); } catch (e) {}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ orig: out.orig, on1: { initMs: out.on1.initMs, boot: out.on1.boot }, on2: { initMs: out.on2.initMs }, off1: { initMs: out.off1.initMs, log: out.off1.log }, verdict: out.verdict }).slice(0, 1500));
