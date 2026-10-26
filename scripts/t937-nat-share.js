#!/usr/bin/env node
// === scripts/t937-nat-share.js — 자연물 청크 짓기(`_natBuildChunk`) 안 몫 (T937 ③ · T920 회부 3) · 러너 밖 계측 자 ==========================
//
//   실클라 하나(`E2E_BROWSER`)로 들어가 가라앉힌 뒤, 청크 짓기와 그 안에서 부르는 함수들을 배타 시간 계량기로 감싸고(계측 자만 · 제품 0 ·
//   짓기 **안에서** 부른 몫만), 자연물 청크 캐시를 비워 시야 청크를 다시 다 지을 때까지 기다린다. 짓기 배타 시간(감싸지 않은 몫)이
//   셀 고리 · **물 거리 고리**(물가 술 갈래 — `fringeOff` 기본이라 안 그리지만 물가 셋째 칸 안의 소품 자리를 비우는 갈래이기도 하다) 몫이다.
// 실행: [E2E_BROWSER=webkit] node scripts/t937-nat-share.js [--n 3] [--out /tmp/t937]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FixClock = require('./fixture-clock.js');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t937'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '3');
const BR = require('./e2e-browser').which();
const CPORT = 3010, ZPORT = 3020;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const FNS = ['_natBuildChunk', 'isWaterAtAbs', 'isRockAtAbs', '_natNoise', '_cellHash'];

(async () => {
  console.log(`\n=== T937 ③ 자연물 청크 짓기 안 몫 — ${BR} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t937n-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: `/tmp/t937n-z-${process.pid}.db`, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 720 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 60000 }).catch(() => {});
  const en = await page.$('#enter'); if (en) await en.click();
  if (!(await FixClock.waitInWorld(page, { timeoutMs: 240000 })).ok) { console.log('입장 실패'); process.exit(1); }
  await sleep(15000);
  await page.evaluate((fns) => {
    const T = window.__t937n = { acc: {}, st: [], depth: 0 };
    for (const n of fns) {
      const f = window[n]; if (typeof f !== 'function' || f.__t937) continue;
      const root = n === '_natBuildChunk';
      const w = function () {
        if (!root && !T.depth) return f.apply(this, arguments);
        const t0 = performance.now(); if (root) T.depth++; T.st.push(0);
        try { return f.apply(this, arguments); }
        finally { const el = performance.now() - t0, ch = T.st.pop(); if (root) T.depth--; const a = T.acc[n] || (T.acc[n] = { n: 0, ex: 0 }); a.n++; a.ex += el - ch; if (T.st.length) T.st[T.st.length - 1] += el; }
      };
      w.__t937 = true; window[n] = w;
    }
  }, FNS);
  const runs = [];
  for (let i = 0; i < N; i++) {
    await page.evaluate(() => { window.__t937n.acc = {}; _natChunk.clear(); });
    let same = 0, last = -1;
    for (let k = 0; k < 120; k++) { await sleep(500); const d = await page.evaluate(() => ({ p: (window.__natDbg && window.__natDbg.pending) || 0, n: _natChunk.size })); if (d.p === 0 && d.n === last && d.n > 0) same++; else same = 0; last = d.n; if (same >= 4) break; }
    const r = await page.evaluate(() => { const A = window.__t937n.acc, B = A._natBuildChunk || { n: 0, ex: 0 };
      let tot = 0; for (const a of Object.values(A)) tot += a.ex;
      return { chunks: B.n, totalMs: +tot.toFixed(1), selfMs: +B.ex.toFixed(1), rows: Object.entries(A).map(([k, a]) => ({ fn: k === '_natBuildChunk' ? '(짓기 배타 — 셀 고리 · 물 거리 고리)' : k, n: a.n, ex: +a.ex.toFixed(1) })).sort((a, b) => b.ex - a.ex) }; });
    console.log(`--- ${i + 1} --- 청크 ${r.chunks} · 짓기 합 ${r.totalMs}ms`); for (const x of r.rows) console.log(`   ${x.fn.padEnd(30)} ${String(x.n).padStart(7)}회 ${String(x.ex).padStart(8)}ms`);
    runs.push(r);
  }
  fs.writeFileSync(path.join(OUT, `t937-nat-${BR}.json`), JSON.stringify({ browser: BR, runs }, null, 1));
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
