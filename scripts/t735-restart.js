#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T735 계측기 · 제품 무변 · 판정 0)
// === scripts/t735-restart.js — 광맥 장부 모아 쓰기: 재기동 뒤 같음 · 끊김(SIGKILL)에 잃는 몫 — 실서버 판 ===
//   틀(T686 의 그 틀 · `tpl-t100.db`)을 복사해 central + zone 을 정본 하루로 띄우고(관측자 1 · 마을 몸이 걷는다 `T312_FISH_ACT=1`),
//   광부 몸이 하루 종일 치도록 수요 문을 끈다(`T374_DEMAND_STOP=0` — 치는 수를 늘리려고만 · 값 판정 아님).
//   ① SIGTERM 판: N 분 친 뒤 SIGTERM → 종료 로그의 메모리 지문 ↔ 같은 DB 로 다시 띄운 부팅 로그의 지문(같아야 한다)
//   ② SIGKILL 판: N 분 친 뒤 `/perf vein`(메모리 지문 · 더러운 셀 · 마지막 쓰기) → 곧바로 DB 파일을 직접 읽은 지문 → SIGKILL → 다시 띄운 부팅 지문
//      ⇒ 부팅 지문 = 끊기 직전 DB 지문(마지막 저장 순간) · ≠ 메모리 지문(그 뒤 친 몫이 잃는 몫이다 · 더러운 셀 수 · 저장 주기 하나 안)
// 쓰는 법: node scripts/t735-restart.js term|kill [분] [T686_TPL=…]  · env 는 아이 판에 그대로(손잡이 `T735_VEIN_BATCH=1` 을 얹어 띄운다)
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');
const ROOT = path.join(__dirname, '..');
const MODE = process.argv[2] || 'term';
const MIN = +(process.argv[3] || 6);
const TPL = process.env.T686_TPL || '/tmp/t686/tpl-t100.db';
const DIR = '/tmp/t735'; fs.mkdirSync(DIR, { recursive: true });
const DB = `${DIR}/rs-${MODE}.db`, CDB = `${DIR}/rs-${MODE}-c.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
const say = (...a) => console.log(`[t735 ${MODE}]`, ...a);
rmdb(DB); rmdb(CDB);
for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) { } }
const CP = 4210, ZP = 4211, SECRET = 't735';
const ENV = Object.assign({}, process.env, { T735_VEIN_BATCH: process.env.T735_VEIN_BATCH || '1', T374_DEMAND_STOP: '0', T312_FISH_ACT: '1' });
//   존의 `_veinDigest(T)` 와 같은 식 — 기준 시각 T 로 리젠을 다시 적분한 재고(소수 6자리) · 정본 `specialty.oreRegen` · 하루 = `WORLD.dayLengthMs`
const Spec = require(path.join(ROOT, 'server', 'specialty'));
const DAYMS = (require(path.join(ROOT, 'server', 'zone-config')).WORLD || {}).dayLengthMs || 1440000;
function dbDigest(file, T) {
  const d = new DatabaseSync(file, { readOnly: true });
  const rows = d.prepare('SELECT cell_key, prosperity, last_t, swings, kgsum FROM mined_cells').all(); d.close();
  rows.sort((a, b) => (a.cell_key < b.cell_key ? -1 : a.cell_key > b.cell_key ? 1 : 0));
  const h = crypto.createHash('sha1');
  for (const r of rows) { const dd = (T - r.last_t) / DAYMS; const se = dd > 0 ? Spec.oreRegen(r.prosperity, dd) : Math.min(Spec.ORE_K, r.prosperity); h.update(r.cell_key + ':' + se.toFixed(6) + ',' + (r.swings || 0) + ',' + (r.kgsum || 0) + ';'); }
  return `T ${T} · 셀 ${rows.length} · 지문 ${h.digest('hex').slice(0, 12)}`;
}
//   T455 시계(t686 자의 그 원점 — 첫 경계 LEAD 초 앞 · 국면 0 = 새벽) — 광부가 낮에 친다. 다시 띄울 때는 끝난 시각 뒤에서 잇는다.
const LEAD = 60;
const AT0 = (Math.floor(fs.statSync(TPL).mtimeMs / 1440000) + 2) * 1440000 - LEAD * 1000;
const clk = (at) => ({ NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}`, T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
let c = null;
function bootCentral() {
  c = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, ENV, clk(AT0), { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
}
function bootZone(tag, at) {
  const logp = `${DIR}/rs-${MODE}-${tag}.log`, lf = fs.openSync(logp, 'w');
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', lf, lf],
    env: Object.assign({}, ENV, clk(at), { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: '1440000', DB_PATH: DB, VILLAGE_WAR_LOG: '0' }) });
  z.logp = logp; return z;
}
const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET }, signal: AbortSignal.timeout(20000) }); return await r.json(); } catch (e) { return null; } };
const up = async () => { for (let i = 0; i < 900; i++) { try { const r = await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) }); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; };
const grepLog = (f, re) => { const t = fs.readFileSync(f, 'utf8').split('\n').filter((l) => re.test(l)); return t[t.length - 1] || ''; };
const exitOf = (z) => new Promise((r) => z.on('exit', (code, sig) => r({ code, sig })));
(async () => {
  bootCentral();
  let z = bootZone('a', AT0); const ex = exitOf(z); const tz0 = Date.now();
  await up(); say('기동');
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => { }); ws.on('message', () => { });
  for (let k = 0; k < MIN; k++) { await sleep(60000); const p = await getj('/perf'); const v = p && p.vein; say(`${k + 1}분 · 광맥 쓰기 문 ${v && v.saves} · NPC ${v && v.npcSaves} · 모아 쓰기 ${v && v.batch ? JSON.stringify({ dirty: v.batch.dirty, flushes: v.batch.flushes, rows: v.batch.rows, ms: v.batch.ms, msMax: v.batch.msMax, now: v.batch.now }) : '끔'}`); }
  const out = { mode: MODE, min: MIN };
  if (MODE === 'term') {
    z.kill('SIGTERM'); const e = await ex; out.exit = e;
    out.shutdown = grepLog(z.logp, /광맥 장부 종료 쓰기/);
    const Ts = +((/T (\d+)/.exec(out.shutdown) || [])[1] || 0);
    out.dbAtShutdownT = dbDigest(DB, Ts);
  } else {
    const p = await getj('/perf'); out.memAtKill = p && p.vein && p.vein.digest; out.batchAtKill = p && p.vein && p.vein.batch;
    const Tk = +((/T (\d+)/.exec(out.memAtKill || '') || [])[1] || 0);
    out.dbAtKill = dbDigest(DB, Tk);
    z.kill('SIGKILL'); out.exit = await ex;
    out.sinceFlushS = out.batchAtKill && out.batchAtKill.last && Tk ? +((Tk - out.batchAtKill.last) / 1000).toFixed(1) : null;   // 존 시계(T455 원점)로 — 끊기 직전 `/perf` 의 T 와 마지막 쓰기 사이
  }
  try { ws.close(); } catch (e) { }
  await sleep(2000);
  z = bootZone('b', AT0 + (Date.now() - tz0) + 1000); const ex2 = exitOf(z);
  await up(); await sleep(3000);
  out.boot = grepLog(z.logp, /광맥 장부 부팅 로드/);
  const Tb = +((/T (\d+)/.exec(out.boot) || [])[1] || 0);
  out.dbAtBootT = dbDigest(DB, Tb);
  z.kill('SIGKILL'); await ex2; try { c.kill('SIGKILL'); } catch (e) { }
  const dg = (s) => { const m = /T \d+ · 셀 \d+ · 지문 [0-9a-f]{12}/.exec(s || ''); return m ? m[0] : null; };
  //   종료 쓰기 순간 메모리 = 그 T 의 DB · 다시 띄운 메모리 = 그 T 의 DB(둘 다 같아야 재기동 뒤 같음)
  if (MODE === 'term') { out.memEqDbAtShutdown = dg(out.shutdown) === out.dbAtShutdownT; out.bootEqDb = dg(out.boot) === out.dbAtBootT; }
  else { out.bootEqDb = dg(out.boot) === out.dbAtBootT; out.memNeDbAtKill = out.memAtKill !== out.dbAtKill; }
  say(JSON.stringify(out, null, 1));
  fs.writeFileSync(`${DIR}/rs-${MODE}.json`, JSON.stringify(out, null, 1));
  rmdb(DB); rmdb(CDB);
  process.exit(0);
})();
