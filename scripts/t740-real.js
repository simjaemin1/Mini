#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T740 계측기 · 제품 무변)
// === scripts/t740-real.js — **실제 시계 판**(T686 자 틀: `t368-farm-day a` t100 팔 200일 끝 DB · 실제 하루 1,440,000ms · 관측자 하나)에서
//     하루 한가운데 SIGTERM → 곧바로 다시 띄워 서버 마을 칸(Map · Set 풀어서)을 **저장 순간 ↔ 다시 뜬 순간**으로 견준다 ===================
//   node scripts/t740-real.js <판> [--wait 360] [--after 120]
//     --wait  틀로 뜬 뒤 관측자를 붙이고 몇 초 돌린 다음 SIGTERM 하나(몸이 밭 · 장 · 집터를 하는 낮 한가운데)
//     --after 다시 뜬 뒤 몇 초 더 돌려 작물 수를 한 번 더 본다
//   손잡이(`T740_SIDE_KEEP` · `T728_RESTART_KEEP`)는 부르는 쪽 env 그대로 존에 간다. 판 env = t368 t100 팔(`T100_FIELD_YIELD=1`).
//   ⇒ $T740_DIR/<판>/ stop.json(저장 줄이 불린 순간 — `t740-side-hook` 의 `T740_SAVE_DUMP`) · resume.json(준비 순간 · t722 훅) · 로그
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const a = process.argv.slice(2);
const TAG = a[0];
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const WAIT = +opt('wait', '360'), AFTER = +opt('after', '120'), PHASE = opt('phase', '');   // --phase P = 하루 위상 P(새벽 0)에 닿을 때까지 기다린다(농부는 아침 출근 창에만 밭에 나간다 — 한낮에 뜬 판은 작물 0)
const DIR = path.join(process.env.T740_DIR || '/tmp/t740/runs', TAG); fs.mkdirSync(DIR, { recursive: true });
const TPL = process.env.T740_TPL || '/tmp/t740/t368/tpl-t100.db';
const DB = path.join(DIR, 'w.db');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rmdb = (f) => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) {} } };
rmdb(DB); for (const s of ['', '-wal', '-shm']) { try { fs.copyFileSync(TPL + s, DB + s); } catch (e) {} }
const CP = 3970 + (process.pid % 10) * 2, ZP = CP + 1, SECRET = 't740-' + TAG;
const pre = ['t722-stop-hook.js', 't740-side-hook.js'].map((f) => `--require ${path.join(__dirname, f)}`).join(' ');
function bootZone(phase, extra) {
  const lf = fs.openSync(path.join(DIR, phase + '.log'), 'w');
  const z = spawn(process.execPath, [path.join(ROOT, 'server/zone.js')], { cwd: ROOT, stdio: ['ignore', lf, lf],
    env: Object.assign({}, process.env, { PORT: String(ZP), ZONE_ID: 'hanbando', CENTRAL_HOST: 'localhost', CENTRAL_PORT: String(CP), CENTRAL_SECRET: SECRET,
      DB_PATH: DB, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: '1440000', VILLAGE_WAR_LOG: '0', T100_FIELD_YIELD: '1', NODE_OPTIONS: pre }, extra) });
  z.exited = new Promise((res) => z.on('exit', (code, sig) => res({ code, sig })));   // 일찍 죽어도 놓치지 않게(종전: 내릴 때 붙여 다시 뜬 판이 먼저 죽으면 기다림이 안 끝났다)
  return z;
}
const term = async (Z) => { try { Z.kill('SIGTERM'); } catch (e) {} const t = setTimeout(() => { try { Z.kill('SIGKILL'); } catch (e) {} }, 120000); const r = await Z.exited; clearTimeout(t); return r; };
const getj = async (p) => { try { const r = await fetch(`http://localhost:${ZP}${p}`, { headers: { 'x-zone-secret': SECRET } }); return await r.json(); } catch (e) { return null; } };
const health = async () => { try { return (await fetch(`http://localhost:${ZP}/health`)).ok; } catch (e) { return false; } };
async function observe() {
  const WS = require(path.join(ROOT, 'node_modules', 'ws'));
  const L0 = await getj('/lifedbg');
  const v0 = (L0 && L0.villages || []).find((v) => v.ccx != null) || { ccx: 0, ccy: 0 };
  const ws = new WS(`ws://localhost:${ZP}/?observer=1`); ws.on('error', () => {}); ws.on('message', () => {});
  const look = () => { try { ws.send(JSON.stringify({ type: 'viewport_update', x: v0.ccx * 32 + 16, y: v0.ccy * 32 + 16, w: 2000, h: 2000 })); } catch (e) {} };
  ws.on('open', look); const iv = setInterval(look, 5000);
  return () => { clearInterval(iv); try { ws.close(); } catch (e) {} };
}
const lifeSum = (L) => { if (!L || !L.villages) return null; let crop = 0, mkt = 0, site = 0, pop = 0; for (const v of L.villages) { crop += v.crop || 0; mkt += v.mkt || 0; site += v.site != null ? 1 : 0; pop += v.pop || 0; } return { phase: L.phase, crop, mkt, site, bodies: pop }; };
(async () => {
  console.log(`=== T740 실제 시계 판 ${TAG} — T740_SIDE_KEEP=${process.env.T740_SIDE_KEEP || '(기본)'} · T728_RESTART_KEEP=${process.env.T728_RESTART_KEEP || '(기본)'} · 틀 ${path.basename(TPL)} ===`);
  const C = spawn(process.execPath, [path.join(ROOT, 'server/central.js')], { cwd: ROOT, stdio: 'ignore',
    env: Object.assign({}, process.env, { PORT: String(CP), DB_PATH: path.join(DIR, 'c.db'), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando', CENTRAL_SECRET: SECRET, NODE_OPTIONS: '' }) });
  const R = { tag: TAG };
  try {
    let t0 = Date.now();
    let Z = bootZone('p1', { T740_SAVE_DUMP: path.join(DIR, 'stop.json') });
    for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
    R.boot1 = (Date.now() - t0) / 1000;
    let close = await observe();
    const s0 = lifeSum(await getj('/lifedbg'));
    console.log(`  p1 부팅 ${R.boot1.toFixed(0)}초 · 관측자 붙음 · ${JSON.stringify(s0)}`);
    if (PHASE !== '') {   // 위상 P 를 (새벽을 한 번 넘긴 뒤라도) 지날 때까지
      const P = +PHASE; let prev = s0 ? s0.phase : 0, wrapped = prev < P;
      for (let i = 0; i < 3600; i++) { await sleep(5000); const L = lifeSum(await getj('/lifedbg')); if (!L) continue;
        if (L.phase + 0.5 < prev) wrapped = true; prev = L.phase; if (wrapped && L.phase >= P) break; }
    } else await sleep(WAIT * 1000);
    const s1 = lifeSum(await getj('/lifedbg')); R.beforeTerm = s1;
    console.log(`  ${PHASE !== '' ? `위상 ${PHASE} 뒤` : `${WAIT}초 뒤`} — ${JSON.stringify(s1)} · SIGTERM`);
    close();
    const tT = Date.now();
    R.exit1 = await term(Z);
    R.termS = (Date.now() - tT) / 1000;
    t0 = Date.now();
    Z = bootZone('p2', { T722_RESUME: path.join(DIR, 'stop.json'), T722_DUMP: path.join(DIR, 'resume.json') });
    for (let i = 0; i < 900 && !(await health()); i++) await sleep(1000);
    R.boot2 = (Date.now() - t0) / 1000; R.gapS = (Date.now() - tT) / 1000;
    close = await observe();
    const s2 = lifeSum(await getj('/lifedbg')); R.afterBoot = s2;
    console.log(`  종료 ${R.termS.toFixed(1)}초 · p2 부팅 ${R.boot2.toFixed(0)}초(멈춘 동안 ${R.gapS.toFixed(0)}초) · ${JSON.stringify(s2)}`);
    await sleep(AFTER * 1000);
    const s3 = lifeSum(await getj('/lifedbg')); R.after = s3;
    console.log(`  ${AFTER}초 뒤 — ${JSON.stringify(s3)}`);
    close();
    R.exit2 = await term(Z);
  } finally { try { C.kill('SIGKILL'); } catch (e) {} }
  fs.writeFileSync(path.join(DIR, 'real.json'), JSON.stringify(R, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
