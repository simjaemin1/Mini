#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1000 자 · 제품 무변)
// === scripts/t1000-load.js — 사람 N 명이 달릴 때 central 저장 요청 수 · 지연 · DB 쓰기 (켬 ↔ 끔) ===
//   node scripts/t1000-load.js [초=120] [N 목록=1,10,50] [--json <파일>]
//   central · 존을 진짜로 띄운다(`test-save-periodic` 꼴 · 주기 저장 간격 운영 기본 30초). 손님 N 명(ws)이 동쪽으로 달린다(막히면 남북으로 비켜 간다).
//   존 곁 프리로드 `t1000-load-probe.js` 가 central 저장 요청을 센다(수 · 지연 · 실패). central DB 쓰기 = 요청마다 players 행 UPDATE 하나(`POST /player/:id`).
//   존 틱 시간은 `/perf` 를 못 쓰는 판이라 재지 않는다 — 저장 고리는 틱당 한 명이고 요청은 fire-and-forget(존이 안 기다린다).
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const WS = require(path.join(__dirname, '..', 'node_modules', 'ws'));
const ROOT = path.join(__dirname, '..');
const SEC = +(process.argv[2] || 120);
const NS = String(process.argv[3] || '1,10,50').split(',').map(Number);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const JOUT = arg('--json', null);
const CPORT = 3510, ZPORT = 3520;
const CDB = `/tmp/t1000l-c-${process.pid}.db`, ZDB = `/tmp/t1000l-z-${process.pid}.db`, OUT = `/tmp/t1000l-${process.pid}.json`;
const clean = () => { for (const f of [CDB, ZDB, OUT]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
function killAll() { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } procs.length = 0; }
process.on('exit', killAll);
function bot() {
  const s = { ws: new WS(`ws://localhost:${ZPORT}`), pid: null, pos: null, welcomed: false, seq: 1, vy: 0, last: null, stuck: 0 };
  s.ws.on('message', (d) => { let m; try { m = JSON.parse(d.toString()); } catch (e) { return; }
    if (m.type === 'welcome') { s.welcomed = true; s.pid = m.pid; }
    else if (m.type === 'tick' && s.pid) { const me = (m.players || []).find((p) => p.pid === s.pid); if (me) s.pos = { x: me.x, y: me.y }; } });
  s.ws.on('error', () => {});
  s.send = (o) => { try { if (s.ws.readyState === 1) s.ws.send(JSON.stringify(o)); } catch (e) {} };
  return s;
}
async function run(N, env) {
  clean();
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot('zone.js', Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T1000_OUT: OUT,
    NODE_OPTIONS: `-r ${path.join(__dirname, 't1000-load-probe.js')}` }, env));
  await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  const B = []; for (let i = 0; i < N; i++) { B.push(bot()); await sleep(50); }
  const t0w = Date.now(); while (Date.now() - t0w < 30000 && !B.every((b) => b.welcomed && b.pos)) await sleep(200);
  await sleep(1500);
  let base = null; try { base = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  await sleep(5200);
  try { base = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  const n0 = base ? base.n : 0, m0 = base ? base.ms.length : 0;
  const p0 = B.map((b) => b.pos && { ...b.pos });
  const end = Date.now() + SEC * 1000; let k = 0;
  while (Date.now() < end) {
    for (const b of B) {
      b.send({ type: 'input', vx: 1, vy: b.vy, seq: b.seq++, sprint: true });
      if (++k % (30 * N) === 0 && b.pos) { const d = b.last ? Math.hypot(b.pos.x - b.last.x, b.pos.y - b.last.y) : 99; if (d < 20) { b.stuck++; b.vy = (b.stuck % 2) ? 1 : -1; } else b.vy = 0; b.last = { ...b.pos }; }
    }
    await sleep(33);
  }
  for (const b of B) b.send({ type: 'input', vx: 0, vy: 0, seq: b.seq++, sprint: false });
  await sleep(6000);   // 마지막 요청 응답 + 프로브 쓰기
  let r = null; try { r = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) {}
  const ran = B.map((b, i) => (b.pos && p0[i]) ? Math.hypot(b.pos.x - p0[i].x, b.pos.y - p0[i].y) : 0);
  const cdbBytes = (() => { let s = 0; for (const x of ['', '-wal']) { try { s += fs.statSync(CDB + x).size; } catch (e) {} } return s; })();
  for (const b of B) { try { b.ws.close(); } catch (e) {} }
  await sleep(500); killAll(); await sleep(1000);
  const ms = r ? r.ms.slice(m0).sort((a, b) => a - b) : [];
  const q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : null;
  const n = r ? r.n - n0 : null;
  clean();
  return { N, n, perMin: n != null ? +(n / (SEC / 60)).toFixed(1) : null, perPersonMin: n != null ? +(n / (SEC / 60) / N).toFixed(2) : null, fail: r ? r.fail : null,
    p50: q(0.5), p95: q(0.95), max: ms.length ? ms[ms.length - 1] : null, ranMedM: +(ran.slice().sort((a, b) => a - b)[Math.floor(ran.length / 2)] / 32).toFixed(1), cdbBytes };
}
(async () => {
  const out = { sec: SEC, rows: [] };
  console.log(`\n=== 사람 N 명이 ${SEC}초 달릴 때 central 저장 요청 (켬 = 기본 · 끔 = T989_CHUNK_SAVE=0) ===`);
  console.log('| N | 팔 | 요청 수 | 분당 | 사람·분당 | 실패 | 지연 p50 · p95 · 최대(ms) | 달린 거리 중앙 | central DB(파일+WAL) |');
  console.log('|---:|---|---:|---:|---:|---:|---|---:|---:|');
  for (const N of NS) for (const [nm, env] of [['켬', {}], ['끔', { T989_CHUNK_SAVE: '0' }]]) {
    const r = await run(N, env); r.arm = nm; out.rows.push(r);
    console.log(`| ${N} | ${nm} | ${r.n} | ${r.perMin} | ${r.perPersonMin} | ${r.fail} | ${r.p50} · ${r.p95} · ${r.max} | ${r.ranMedM}m | ${r.cdbBytes} |`);
  }
  if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out));
  process.exit(0);
})().catch((e) => { console.error('자 실패:', e); killAll(); process.exit(1); });
