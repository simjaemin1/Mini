#!/usr/bin/env node
// === scripts/t962-vil-cost.js — 끔 판 값(T962 ②) · 러너 밖 계측 자 ==================================================================
//   마을 그림 굽기 한 판(99-main `done` · 크롬 추적 FunctionCall)이 **main 트리** 와 **이 트리(끔 = 생성기를 한 판에 다)** 에서 같은 값인지 —
//   두 트리를 다른 포트로 띄우고 판마다 새 브라우저로 번갈아 띄워 잰다(상자 흔들림을 두 쪽에 고루 · 그 안 GC 도 적는다).
// 실행: node scripts/t962-vil-cost.js <main 트리 경로> [판 수=10]
'use strict';
const path = require('path'); const fs = require('fs'); const { spawn } = require('child_process');
const FB = require('./fixture-boot'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const procs = [];
function boot(root, file, env) { const p = spawn(process.execPath, [path.join(root, 'server', file)], { cwd: root, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] }); p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p; }
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function up(root, cp, zp) { const c = boot(root, 'central.js', { PORT: String(cp), DB_PATH: `/tmp/t962x-c-${cp}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot(root, 'zone.js', { PORT: String(zp), ZONE_ID: 'hanbando', DB_PATH: `/tmp/t962x-z-${zp}.db`, CENTRAL_URL: `http://localhost:${cp}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  await FB.waitUp(c, /central server up on/, { name: 'central' }); await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 }); }
(async () => {
  // zone port must match central's zone map? central uses ENABLED_ZONES + zone registers via CENTRAL_URL; lobby only needs central
  const MAIN = process.argv[2]; if (!MAIN) { console.log('main 트리 경로가 없다'); process.exit(2); }
  await up(MAIN, 3110, 3120); await up(path.join(__dirname, '..'), 3010, 3020);
  const { chromium } = require('playwright'); const N = +process.argv[3] || 10; const res = { main: [], br: [] };
  for (let i = 0; i < N; i++) for (const [k, port] of [['main', 3110], ['br', 3010]]) {
    const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
    const f = path.join(require('os').tmpdir(), `t962-cost-${k}-${process.pid}.json`);
    await browser.startTracing(page, { path: f, categories: ['devtools.timeline', 'v8'] });
    await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded' }); await sleep(4000); await browser.stopTracing(); await browser.close();
    const ev = JSON.parse(fs.readFileSync(f, 'utf8')).traceEvents; fs.unlinkSync(f);
    const t = ev.find((e) => e.name === 'thread_name' && e.args.name === 'CrRendererMain' && ev.some((x) => x.pid === e.pid && x.name === 'EventDispatch' && x.args && x.args.data && x.args.data.type === 'load'));
    const mine = ev.filter((e) => e.pid === t.pid && e.tid === t.tid && e.ph === 'X');
    const fc = mine.filter((e) => e.name === 'FunctionCall' && e.args && e.args.data && /99-main/.test(e.args.data.url || '') && e.args.data.functionName === 'done').sort((a, b) => b.dur - a.dur)[0];
    const gc = mine.filter((e) => /^(MinorGC|MajorGC)$/.test(e.name) && e.ts >= fc.ts && e.ts <= fc.ts + fc.dur).reduce((s, e) => s + e.dur, 0);
    res[k].push([Math.round(fc.dur / 1000), Math.round(gc / 1000)]); console.log(k, i, Math.round(fc.dur / 1000), 'gc', Math.round(gc / 1000));
  }
  const st = (a) => { const v = a.map((x) => x[0]).sort((x, y) => x - y); return `n${v.length} med ${v[v.length >> 1]} mean ${(v.reduce((s, x) => s + x, 0) / v.length).toFixed(0)} min ${v[0]} max ${v[v.length - 1]} · gc med ${a.map((x) => x[1]).sort((x, y) => x - y)[a.length >> 1]}`; };
  console.log('main', st(res.main)); console.log('br  ', st(res.br)); process.exit(0);
})().catch((e) => { console.log(e.stack); process.exit(1); });
