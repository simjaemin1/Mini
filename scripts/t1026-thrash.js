#!/usr/bin/env node
// === scripts/t1026-thrash.js — 재기동 직후 무효화 → 교역로 슬롯 서로 버림 · 귀속 자 (T1026 · 2026-10-31) ======================
//
// ⚠계측기다(러너 밖 · `@regress` 없음). 제품 무변 — 레포(또는 `--dir` 사본)의 서버를 그대로 띄운다.
// 틀 = T945 §4 "처음 꼴": 다시 뜬 60날 세계(`t368-farm-day a` · `T368_DAYS=60` → `/tmp/t646/tpl/tpl-t100.db`)를 **부팅하자마자**
//   (t455 고정 원점 = 하루 경계 LEAD 150초 앞 · 교역로 캐시 복원 · 되살림 줄 T775 에 캐러밴이 선 때) 진짜 무효화 훅 한 번
//   (`/routedbg?invalidate=1` — 라이브 벽 · 울타리와 같은 `invalidateTradeDistances`) · 그 뒤 30초 조각 N 개(기본 30 = 15분).
// 조각마다 `/perf` probe 누계: 일 시작(`pathJobs`) · 버림(`pathDrop`) · 다 판 쌍(`routeCold`) · 기다림(`pathWait`) · 되살림 줄(`t775`) ·
//   문마다 셈(`t1026` — 시작 · 기다림 · 버림 `버린 문>새 문`) · 선계산 남은 쌍(`/routedbg warmLeft`) · 틱 p50 · p95 · max(조각마다 `?reset=1`).
//
// 실행: node scripts/t1026-thrash.js <tag> [--dir <코드 사본>] [--slices N]   · 존 env 는 이 프로세스 env 를 물려받는다(예: T1026_SLOT_KEEP=0)
//   T1026_TPL(기본 /tmp/t646/tpl/tpl-t100.db) · T1026_OUT(기본 /tmp/t1026) · T1026_PORT(기본 4110 · 존 = +1) · T1026_LEAD_S(기본 150)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const TAG = process.argv[2];
if (!TAG || TAG.startsWith('--')) { console.error('쓰기: node scripts/t1026-thrash.js <tag> [--dir <사본>] [--slices N]'); process.exit(2); }
const DIR = path.resolve(arg('--dir', ROOT));
const SLICES = parseInt(arg('--slices', '30'), 10), SLICE_S = 30;
const TPL = process.env.T1026_TPL || '/tmp/t646/tpl/tpl-t100.db';
const OUT = process.env.T1026_OUT || '/tmp/t1026';
const CP = +(process.env.T1026_PORT || 4110), ZP = CP + 1, SECRET = 't1026';
const LEAD_S = parseInt(process.env.T1026_LEAD_S || '150', 10);
const DAY = 1440000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const DB = `/tmp/t1026-z-${TAG}.db`, CDB = `/tmp/t1026-c-${TAG}.db`;
  rmdb(DB); rmdb(CDB);
  for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
  const at = (Math.floor(fs.statSync(TPL).mtimeMs / DAY) + 2) * DAY - LEAD_S * 1000;   // t646 과 같은 고정 원점(T455)
  const logp = path.join(OUT, `${TAG}.log`), logf = fs.openSync(logp, 'w');
  const env0 = Object.assign({}, process.env, { NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
  const c = spawn(process.execPath, [path.join(DIR, 'server/central.js')], { cwd: DIR, stdio: 'ignore',
    env: Object.assign({}, env0, { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const z = spawn(process.execPath, [path.join(DIR, 'server/zone.js')], { cwd: DIR, stdio: ['ignore', logf, logf],
    env: Object.assign({}, env0, { VILLAGE_NPC_CAP: '40', PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP),
      CENTRAL_SECRET: SECRET, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), DB_PATH: DB, VILLAGE_WAR_LOG: '0', T312_FISH_ACT: '1', E2E_GIVE: '1' }) });
  const kill = () => { try { z.kill('SIGKILL'); } catch (e) {} try { c.kill('SIGKILL'); } catch (e) {} };
  process.on('exit', kill);
  const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
  const say = (...a) => console.log(`[${TAG}]`, ...a);
  const t0 = Date.now();
  for (let i = 0; i < 900; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});   // t646 과 같이 관측자 하나
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  // 캐시 복원 + 되살림 줄이 선 때를 기다린다(그때가 '다시 뜬 직후')
  let R0 = null, P0 = null;
  for (let i = 0; i < 600; i++) {
    R0 = await getj('/routedbg'); P0 = await getj('/perf');
    const pr = (P0 && P0.econTick && P0.econTick.probe) || {};
    if (R0 && R0.mem > 0 && pr.t775 && pr.t775.wait > 0) break;
    await sleep(1000);
  }
  const pr0 = (P0 && P0.econTick && P0.econTick.probe) || {};
  const L0 = await getj('/lifedbg');
  let inv = null;
  for (let i = 0; i < 30 && !(inv && inv.invalidated); i++) { inv = await getj('/routedbg?invalidate=1'); if (!(inv && inv.invalidated)) await sleep(500); }
  const R1 = await getj('/routedbg');
  say('기동', Date.now() - t0, 'ms · 캐시', R0 && R0.mem, '· 되살림 줄', pr0.t775 && pr0.t775.wait, '· phase', L0 && L0.phase, '· 무효화', !!(inv && inv.invalidated), '· 선계산 줄', R1 && R1.warmLeft, '· 슬롯 손잡이', pr0.t1026 ? pr0.t1026.on : '(없음)');
  const head = { tag: TAG, dir: DIR, at, env: { T1026_SLOT_KEEP: process.env.T1026_SLOT_KEEP || '' }, boot: { ms: Date.now() - t0, mem: R0 && R0.mem, t775: pr0.t775 || null, phase: L0 && L0.phase, warmAfter: R1 && R1.warmLeft, invalidated: !!(inv && inv.invalidated) }, base: { pathJobs: pr0.pathJobs | 0, pathDrop: pr0.pathDrop | 0, routeCold: pr0.routeCold | 0, pathWait: pr0.pathWait | 0 } };
  const slices = [];
  for (let k = 0; k < SLICES; k++) {
    await getj('/perf?reset=1');
    const mark = fs.statSync(logp).size;
    await sleep(SLICE_S * 1000);
    const p = await getj('/perf'), R = await getj('/routedbg'), L = await getj('/lifedbg');
    const pr = (p && p.econTick && p.econTick.probe) || {}, t = p && p.tick && p.tick.ms;
    const buf = fs.readFileSync(logp).subarray(mark).toString('utf8');
    const S = { k, phase: L && L.phase, p50: t && t.p50, p95: t && t.p95, max: t && t.max, ticks: p && p.tick && p.tick.n,
      pathJobs: pr.pathJobs | 0, pathDrop: pr.pathDrop | 0, routeCold: pr.routeCold | 0, pathWait: pr.pathWait | 0,
      t775: pr.t775 || null, t1026: pr.t1026 || null, warmLeft: R && R.warmLeft, mem: R && R.mem,
      astar: (buf.match(/교역로 A\*:/g) || []).length, arr: (buf.match(/캐러밴#\d+ 도착:/g) || []).length };
    slices.push(S);
    say(`조각 ${k} · phase ${S.phase != null ? (+S.phase).toFixed(3) : '?'} · 시작 ${S.pathJobs - head.base.pathJobs} · 버림 ${S.pathDrop - head.base.pathDrop} · 다 판 ${S.routeCold - head.base.routeCold} · 캐시 ${S.mem} · 줄 ${S.t775 ? S.t775.wait : '?'} · 몸 ${S.t775 ? S.t775.spawned : '?'} · 선계산 남음 ${S.warmLeft} · p50 ${t ? t.p50 : '?'} · p95 ${t ? t.p95 : '?'}`);
  }
  clearInterval(ping); try { ws.close(); } catch (e) {}
  fs.writeFileSync(path.join(OUT, `${TAG}.json`), JSON.stringify(Object.assign(head, { slices }), null, 1));
  say('끝 →', path.join(OUT, `${TAG}.json`));
  kill();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
