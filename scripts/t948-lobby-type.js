#!/usr/bin/env node
// === scripts/t948-lobby-type.js — 로비 이름 칸 타자 지연 표 (T948 ② · `T937_GT_PREWARM` 켬 기본) · 러너 밖 계측 자 ==========================
//
//   `E2E_BROWSER`(기본 chromium · `webkit`)로 판마다 새 컨텍스트(빈 캐시) 로비를 열고, 페이지가 뜨자마자 이름 칸(`#name`)에
//   글자 16개(칸 `maxlength`)를 200ms 간격으로 친다(로비 데우기가 이 3초 안에 돈다 — 풀 텍스처가 오면). 잰다:
//     · 글자마다 **밀림** = (그 글자 keydown 처리 시각 − 첫 글자 처리 시각) − (그 글자를 누른 시각 − 첫 글자를 누른 시각)
//       — 누른 간격보다 처리 간격이 벌어진 몫 · 시계 둘의 차만 써서 맞출 일이 없다
//     · 글자마다 **누름 왕복** = 자가 키 하나를 보내고 브라우저가 그 사건을 다 넘겼다고 답하기까지(자 쪽 ms) — 주 스레드가 막혀 있으면
//       그 사건이 줄을 서므로 이 값이 는다(자는 이 답을 기다린 뒤 다음 키를 누르므로 밀림은 0 에 가깝고, 막힘은 여기 나타난다)
//     · 주 스레드 막힘 = 10ms 타이머 간격에서 10ms 를 넘긴 몫(최대 · 50ms 넘은 횟수 — T913 긴 프레임 문턱)
//     · 칸에 실제로 든 글자 수(빠짐 0 이어야) · 데우기 시각(`_ld.prewarm` — 마스크 · 잎 ms)
//   central env 는 이 자를 부른 env 를 물려받는다(`T937_GT_PREWARM=0` = 끔 판).
// 실행: [E2E_BROWSER=webkit] [T937_GT_PREWARM=0] node scripts/t948-lobby-type.js [--n 3] [--out /tmp/t948] [--tag 이름]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t948'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '3');
const BR = require('./e2e-browser').which();
const TAG = arg('--tag', BR);
const CPORT = 3010, ZPORT = 3020;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server', file)], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {}); procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
const TEXT = 'abcdefghijklmnop';   // 16자 = 이름 칸 `maxlength` 그대로(index.html)

(async () => {
  console.log(`\n=== T948 로비 타자 지연 — ${BR} · ${N}판 · ${TAG} · central env T937_GT_PREWARM=${process.env.T937_GT_PREWARM == null ? '(없음 = 기본)' : process.env.T937_GT_PREWARM} ===`);
  const c = boot('central.js', { PORT: String(CPORT), DB_PATH: `/tmp/t948-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const z = boot('zone.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: `/tmp/t948-z-${process.pid}.db`, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0' });
  if (!(await FB.waitUp(c, /central server up on/, { name: 'central' })).ok || !(await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 })).ok) { console.log('기동 실패'); process.exit(1); }
  const browser = await require('./e2e-browser').launch({ headless: true });
  const runs = [];
  for (let i = 0; i < N; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 720 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      const M = window.__t948 = { kd: [], gaps: [], t0: performance.now() };
      const el = document.getElementById('name');
      if (el) el.addEventListener('keydown', () => { M.kd.push(performance.now()); });
      let last = performance.now(); M.iv = setInterval(() => { const n = performance.now(); M.gaps.push([n, n - last - 10]); last = n; }, 10);
    });
    const nm = await page.$('#name'); if (nm) await nm.click();
    const sent = [], pressMs = [];
    for (const ch of TEXT) { const t = Date.now(); sent.push(t); await page.keyboard.press(ch); pressMs.push(Date.now() - t); await sleep(200); }
    await sleep(1500);
    const r = await page.evaluate(([T, sent]) => {
      const M = window.__t948; clearInterval(M.iv);
      const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return +b[Math.min(b.length - 1, Math.floor(b.length * p))].toFixed(1); };
      const kd = M.kd.map((t, k) => Math.max(0, (t - M.kd[0]) - (sent[k] - sent[0]))), g = M.gaps.map((x) => Math.max(0, x[1]));
      const val = (document.getElementById('name') || {}).value || '';
      const pw = (typeof _ld !== 'undefined' && _ld.prewarm) ? _ld.prewarm : null;
      const span = [M.kd.length ? M.kd[0] : null, M.kd.length ? M.kd[M.kd.length - 1] : null];
      return { keys: kd.length, typed: val.length, intact: val === T, kd: { p50: q(kd, 0.5), p95: q(kd, 0.95), max: q(kd, 1) },
        block: { max: q(g, 1), over50: g.filter((x) => x > 50).length }, prewarm: pw, prewarmInTyping: !!(pw && pw.at != null && span[0] != null && pw.at >= span[0] - 50 && pw.at <= span[1]) };
    }, [TEXT, sent]);
    const pq = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
    r.press = { p50: pq(pressMs, 0.5), p95: pq(pressMs, 0.95), max: Math.max(...pressMs), all: pressMs };
    console.log(`--- ${i + 1} --- 누름 왕복 p50 ${r.press.p50} · p95 ${r.press.p95} · max ${r.press.max}ms · 글자 ${r.keys}/${TEXT.length} · 칸 ${r.typed}자(${r.intact ? '그대로' : '어긋남'}) · 글자 밀림 p50 ${r.kd.p50} · p95 ${r.kd.p95} · max ${r.kd.max}ms · 주 스레드 막힘 max ${r.block.max}ms · >50ms ${r.block.over50}번 · 데우기 ${r.prewarm ? `마스크 ${r.prewarm.mask} · 잎 ${r.prewarm.grass}ms${r.prewarmInTyping ? ' (타자 중)' : ''}` : '없음'}`);
    runs.push(r);
    fs.writeFileSync(path.join(OUT, `t948-type-${TAG}.json`), JSON.stringify({ browser: BR, tag: TAG, runs }, null, 1));
    await ctx.close(); await sleep(1500);
  }
  await browser.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
