#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T747 계측기 · 제품 무변 · 판정 0)
// === scripts/t747-real.js — 실제 시계 판에서 하루 한가운데 SIGTERM → 곧바로 다시 띄워 **마을 몸 칸**을 저장 순간 ↔ 다시 뜬 첫 틱으로 견준다 ===
//   틀 = T686 자의 그 틀(`t368-farm-day a` t100 팔 200일 끝 DB · `T747_TPL`) · 하루 1,440,000 ms · T455 시계(첫 경계 60초 뒤 · 국면 0 = 새벽).
//   마을 몸이 관측자와 무관하게 걷게 `T312_FISH_ACT=1`(T686 자 기본 env 그대로 — 두 팔 같다).
//   node scripts/t747-real.js <판> [--wait 420]   ⇒ $T747_DIR/<판>/ save.json · ready.json · cmp.json · 로그
//   손잡이(`T747_BODY_KEEP` 등)는 부르는 쪽 env 그대로 존에 간다.
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const a = process.argv.slice(2);
const TAG = a[0] || 'x';
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const WAIT = +opt('wait', '420');
const DIR = path.join(process.env.T747_DIR || '/tmp/t747', TAG); fs.mkdirSync(DIR, { recursive: true });
const TPL = process.env.T747_TPL || '/tmp/t686/tpl-t100.db';
const DB = path.join(DIR, 'w.db'), CDB = path.join(DIR, 'c.db');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
rmdb(DB); rmdb(CDB); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) { } }
const CP = 4310, ZP = 4311, SECRET = 't747';
const AT0 = (Math.floor(fs.statSync(TPL).mtimeMs / 1440000) + 2) * 1440000 - 60000;
const clk = (at, hook) => ({ NODE_OPTIONS: `--require ${path.join(__dirname, 't455-clock.js')}` + (hook ? ` --require ${path.join(__dirname, 't747-body-hook.js')}` : ''), T455_CLOCK_PRE: '1', T455_CLOCK_AT: String(at) });
const ENV = Object.assign({}, process.env, { T312_FISH_ACT: '1' });
function bootZone(phase, at, extra) {
  const lf = fs.openSync(path.join(DIR, phase + '.log'), 'w');
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', lf, lf],
    env: Object.assign({}, ENV, clk(at, true), { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: DB, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: '1440000', VILLAGE_WAR_LOG: '0' }, extra) });
  z.exited = new Promise((res) => z.on('exit', (code, sig) => res({ code, sig })));
  return z;
}
const term = async (Z) => { try { Z.kill('SIGTERM'); } catch (e) { } const t = setTimeout(() => { try { Z.kill('SIGKILL'); } catch (e) { } }, 150000); const r = await Z.exited; clearTimeout(t); return r; };
const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`, { signal: AbortSignal.timeout(3000) })).ok; } catch (e) { return false; } };
async function observe() {
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => { }); ws.on('message', () => { });
  return () => { try { ws.close(); } catch (e) { } };
}
(async () => {
  console.log(`=== T747 실제 시계 판 ${TAG} — T747_BODY_KEEP=${process.env.T747_BODY_KEEP || '(기본)'} · 틀 ${path.basename(TPL)} · ${WAIT}초 ===`);
  const C = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, ENV, clk(AT0, false), { PORT: String(CP), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET }) });
  const R = { tag: TAG, wait: WAIT };
  try {
    const t0 = Date.now();
    let Z = bootZone('p1', AT0, { T747_SAVE_DUMP: path.join(DIR, 'save.json') });
    for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
    let close = await observe();
    await sleep(WAIT * 1000);
    close();
    R.exit1 = await term(Z);
    const at2 = AT0 + (Date.now() - t0) + 1000;
    Z = bootZone('p2', at2, { T747_READY_DUMP: path.join(DIR, 'ready.json') });
    for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
    close = await observe();
    await sleep(15000);
    close();
    R.exit2 = await term(Z);
  } finally { try { C.kill('SIGKILL'); } catch (e) { } }
  fs.writeFileSync(path.join(DIR, 'real.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R));
  rmdb(DB); rmdb(CDB);
})().catch((e) => { console.error(e); process.exit(1); });
