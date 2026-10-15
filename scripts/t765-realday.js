#!/usr/bin/env node
// === scripts/t765-realday.js — T765 실제 하루 판(T686 자의 시계 · 러너 밖 · `@regress` 없음 · 제품 무변) ==========================
//
// ★무엇 [T765 ① "실제 하루 판 하나(T686 자 · 몸이 실제로 걷나 — 걸은 몸 수 · 거리 · 하루 몫)"]
//   정본 하루 24분(`VILLAGE_DAY_MS=1440000`) · T455 고정 원점(첫 경계 = 띄운 뒤 `T765_LEAD_S`초) · 관측자 1(`?observer=1` · 5초 ping) — T686 자의 시계 그대로.
//   새 세계(손님 0) · 해체를 첫 하루에 세운다: 도적 시험 손잡이 `BANDIT_FIXTURE=dissolve`(최빈곤 마을 해체 조건) · `BANDIT_MINDAY=1`(보호기 1일) —
//   둘 다 bandits.js 머리글의 **시험 전용** 손잡이다(운영 무설정). 그 밖 env(손잡이 `T577_CAND_WALK` · `T521_GANG_ARMS`)는 존에 그대로 간다.
//   관측 = `scripts/t765-walkobs.js`(읽기만) — 걷는 몸마다 거리 · 날 · 끝(붙음/거둠) · 받는 마을 새 몸 수.
//
// 실행: node scripts/t765-realday.js <tag> [--tree <디렉터리>] [--bounds 3]      (T765_DIR=/tmp/t765rd · T765_LEAD_S=360 · T765_PORT=4310)
//       T577_CAND_WALK=1 node scripts/t765-realday.js on      # 켬 판
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const HERE = __dirname;
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const TAG = A.find((x, i) => !x.startsWith('--') && !(A[i - 1] || '').startsWith('--')) || 'run';
const TREE = path.resolve(opt('--tree', path.join(HERE, '..')));
const BOUNDS = parseInt(opt('--bounds', '3'), 10);
const DIR = process.env.T765_DIR || '/tmp/t765rd';
const LEAD_S = parseInt(process.env.T765_LEAD_S || '360', 10);
const DAY = parseInt(process.env.T765_DAY_MS || '', 10) || 1440000;   // 정본 24분(짧은 날은 연기 판 전용 — 표에 안 쓴다)
const ZP = +(process.env.T765_PORT || 4310);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(DIR, { recursive: true });
const DB = path.join(DIR, `z-${TAG}.db`);
for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s); } catch (e) {} }
const OUT = path.join(DIR, `${TAG}.walk.json`), LOG = path.join(DIR, `${TAG}.log`);
try { fs.unlinkSync(OUT); } catch (e) {}
const at = (Math.floor(Date.now() / DAY) + 2) * DAY - LEAD_S * 1000;   // T455 고정 원점 — 첫 경계가 띄운 뒤 LEAD_S 초
const logf = fs.openSync(LOG, 'w');
const env = Object.assign({}, process.env, {
  NODE_OPTIONS: `--require ${path.join(HERE, 't455-clock.js')} --require ${path.join(HERE, 't765-walkobs.js')}`,
  T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at), T765_WALK_OUT: OUT,
  ZONE_ID: 'hanbando', PORT: String(ZP), DB_PATH: DB, CENTRAL_URL: 'http://localhost:1',
  ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY), VILLAGE_WAR_LOG: '0',
  BANDIT_FIXTURE: 'dissolve', BANDIT_MINDAY: '1',
  T640_BOOT_SLICE: '0',   // 도적 부팅 표본을 부팅 안에서(교역로 디스크 캐시 · t577 자 그 조건) — 첫 경계부터 도적 하루가 돈다
  T699_ROUTE_CACHE: process.env.T699_ROUTE_CACHE || '/tmp/durango-route-cache',
});
const z = spawn(process.execPath, [path.join(TREE, 'server', 'zone.js')], { cwd: TREE, stdio: ['ignore', logf, logf], env });
const say = (...a) => console.log(`[${TAG}]`, ...a);
let dead = false; z.on('exit', (code, sig) => { dead = true; say(`존 끝 code=${code} signal=${sig}`); });
process.on('exit', () => { try { z.kill('SIGKILL'); } catch (e) {} });
(async () => {
  const t0 = Date.now();
  for (let i = 0; i < 900 && !dead; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) break; } catch (e) {} await sleep(1000); }
  say('기동', ((Date.now() - t0) / 1000).toFixed(0), '초 · 나무', TREE);
  const WS = require(path.join(HERE, '..', 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const ping = setInterval(() => { try { ws.send(JSON.stringify({ type: 'ping', t: Date.now() })); } catch (e) {} }, 5000);
  const endWall = t0 + LEAD_S * 1000 + (BOUNDS - 1) * DAY + 180000;   // 마지막 경계 뒤 3분(하루 마감 조각이 다 돈다)
  say(`경계 ${BOUNDS}개 — 첫 경계 ${LEAD_S}초 · 끝 ${((endWall - t0) / 60000).toFixed(1)}분(벽)`);
  while (Date.now() < endWall && !dead) await sleep(30000);
  clearInterval(ping);
  try { z.kill('SIGUSR2'); } catch (e) {}
  await sleep(5000);
  try { z.kill('SIGKILL'); } catch (e) {}
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s); } catch (e) {} }
  say('끝 →', OUT);
  process.exit(0);
})();
