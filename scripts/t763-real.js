#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T763 계측기 · 제품 무변)
// === scripts/t763-real.js — **실제 시계 전쟁 판**: T686 자 틀(`t368-farm-day a` t100 팔 200일 끝 DB)을 띄우고 `WAR_FIXTURE` 로 원정 하나를 세워
//     병사 몸(짐꾼)이 실제로 걷나 · 짐 kg · 하루 몫 · 노획을 `t763-war-hook` 으로 적는다 ==========================================
//   node scripts/t763-real.js <판> [--min 50] [--day-ms 1440000] [--fixture assault]
//   손잡이(`T423_RATION_ACT` · `T466_LOOT_ACT`)는 부르는 쪽 env 그대로 존에 간다(끔 판 = env 없음 · ★[T861] `T423_RATION_ACT` 는 켬 기본 — 끈 판은 명시 `=0`).
//   ⇒ $T763_DIR/<판>/ war.json(전쟁마다 마지막 꼴 · 짐꾼 몸 걸음) · z.log(존 로그 · 전쟁 로그 켬) · real.json(요약)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const a = process.argv.slice(2);
const TAG = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const MIN = +opt('min', '50'), DAYMS = opt('day-ms', '1440000'), FIX = opt('fixture', 'assault');
const DIR = path.join(process.env.T763_DIR || '/tmp/t763/real', TAG); fs.mkdirSync(DIR, { recursive: true });
const TPL = process.env.T763_TPL || '/tmp/t740/t368/tpl-t100.db';
const DB = path.join(DIR, 'w.db');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(DB + s); } catch (e) {} try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
const CP = 4170 + (process.pid % 400) * 2, ZP = CP + 1, SECRET = 't763-' + TAG;
const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
(async () => {
  console.log(`=== T763 실제 시계 전쟁 판 ${TAG} — 하루 ${DAYMS} ms · ${MIN} 분 · 픽스처 ${FIX} · T423=${process.env.T423_RATION_ACT || '켬(기본 · T861)'} · T466=${process.env.T466_LOOT_ACT || '끔'} ===`);
  const C = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: path.join(DIR, 'c.db'), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET, NODE_OPTIONS: '' }) });
  const lf = fs.openSync(path.join(DIR, 'z.log'), 'w');
  const Z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', lf, lf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: DB, ENABLED_VILLAGES: '1', VILLAGE_DAY_MS: DAYMS, VILLAGE_WAR_LOG: '1', T100_FIELD_YIELD: '1', WAR_FIXTURE: FIX,
      T763_OUT: path.join(DIR, 'war.json'), T763_WALK_MS: process.env.T763_WALK_MS || '2000',
      NODE_OPTIONS: `--require ${path.join(__dirname, 't763-war-hook.js')}` }) });
  const exited = new Promise((res) => Z.on('exit', (code, sig) => res({ code, sig })));
  const R = { tag: TAG, dayMs: +DAYMS, min: MIN, fixture: FIX };
  try {
    const t0 = Date.now();
    for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
    R.boot = (Date.now() - t0) / 1000;
    const WS = require(path.join(ROOT, 'node_modules', 'ws'));
    const L0 = await getj('/lifedbg'); const LOOK = opt('look', ''); const v0 = (L0 && L0.villages || []).find((v) => v.ccx != null && (!LOOK || v.name === LOOK)) || (L0 && L0.villages || []).find((v) => v.ccx != null) || { ccx: 0, ccy: 0 }; R.look = { name: v0.name, ccx: v0.ccx, ccy: v0.ccy };   // --look <마을> = 관측자를 그 마을에(전쟁 몸이 관측자 곁이면 틱마다 걷는다)
    const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
    const look = () => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: v0.ccx * 32 + 16, y: v0.ccy * 32 + 16, w: 2000, h: 2000 })); } catch (e) {} };
    ws.on('open', look); const iv = setInterval(look, 5000);
    console.log(`  부팅 ${R.boot.toFixed(0)}초 · 관측자 붙음(${JSON.stringify(R.look)})`);
    const tEnd = Date.now() + MIN * 60000;
    while (Date.now() < tEnd) { await sleep(30000); const L = await getj('/lifedbg'); if (L) R.lastPhase = L.phase; }
    clearInterval(iv); try { ws.close(); } catch (e) {}
    try { Z.kill('SIGTERM'); } catch (e) {}
    const tk = setTimeout(() => { try { Z.kill('SIGKILL'); } catch (e) {} }, 120000);
    R.exit = await exited; clearTimeout(tk);
  } finally { try { C.kill('SIGKILL'); } catch (e) {} }
  try { R.war = JSON.parse(fs.readFileSync(path.join(DIR, 'war.json'), 'utf8')); } catch (e) { R.war = null; }
  fs.writeFileSync(path.join(DIR, 'real.json'), JSON.stringify(R, null, 1));
  console.log(JSON.stringify(R.war && { wars: R.war.wars, kgPeak: R.war.kgPeak, walk: R.war.walk }, null, 0).slice(0, 3000));
})().catch((e) => { console.error(e); process.exit(1); });
