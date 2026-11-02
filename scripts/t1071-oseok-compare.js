#!/usr/bin/env node
// === scripts/t1071-oseok-compare.js — 판 글자 세 길 견주기(T1071 ②) · 러너 밖 계측 자 ===========================
//
//   public/ 을 작은 정적 서버로 띄우고 `oseok-demo.html?way=canvas|svg|css&shot=1&fit=0` 를 1440×1080 으로 연다.
//   길마다: ⓐ 화면 사진(시안 `마을_dash.jpg` 와 같은 자리 · tools/oseok/compare.py 가 잘라 견준다)
//           ⓑ 처음 그리기(짓기 ms · 첫 그림까지 ms)
//           ⓒ 글자 바꾸기 값 — 숫자 든 글자(dyn) · 전부(all)를 바꾼 판의 주 스레드 ms(rAF → 그 판 뒤 메시지) 가운데 · 안 바꾼 판
//           ⓓ 매 판 바꾸기 초당 판 수(크롬은 --disable-frame-rate-limit · WebKit 은 60 묶임)
//   제품 무접촉(보기 판 · 모듈만 연다).
// 실행: [E2E_BROWSER=webkit] node scripts/t1071-oseok-compare.js [--out /tmp/t1071] [--n 40] [--ways canvas,svg,css] [--dpr 1] [--c '{"soft":true}'] [--tag 이름]
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t1071'); fs.mkdirSync(OUT, { recursive: true });
const N = +arg('--n', '40');
const WAYS = arg('--ways', 'canvas,svg,css').split(',');
const DPR = +arg('--dpr', '1');
const EXTRA = JSON.parse(arg('--c', '{}'));
// 셋 다 같은 돌 기준에 맞춘 값은 모듈 기본값(Oseok.C)에 있다(scripts/t1071-oseok-tune.js · 크롬 · 판 자리 평균 |Δ| 가장 작은 값)
const TUNED = { canvas: {}, svg: {}, css: {} };
const TAG = arg('--tag', '');
const XCSS = arg('--css', '');
const BRW = require('./e2e-browser');
const BR = BRW.which();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2', '.css': 'text/css' };
const med = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[s.length >> 1].toFixed(2); };

(async () => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(PUB, u === '/' ? 'index.html' : u);
    if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(r);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  let browser;
  if (BR === 'chromium') {
    const pw = require('playwright');
    browser = await pw.chromium.launch({ headless: true, executablePath: pw.chromium.executablePath(), args: ['--disable-frame-rate-limit', '--disable-gpu-vsync'] });
  } else browser = await BRW.launch({ headless: true });
  const res = { browser: BR, dpr: DPR, extra: EXTRA, tuned: TUNED, ways: {} };
  for (const way of WAYS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1080 }, deviceScaleFactor: DPR });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${port}/oseok-demo.html?way=${way}&shot=1&fit=0&c=${encodeURIComponent(JSON.stringify(Object.assign({}, TUNED[way], EXTRA)))}${XCSS ? '&css=' + encodeURIComponent(XCSS) : ''}`);
    let st = null; for (let k = 0; k < 300; k++) { st = await page.evaluate(() => window.__oseok); if (st && st.ready) break; await sleep(100); }
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `${BR}-${way}${DPR !== 1 ? '@' + DPR : ''}${TAG}.png`) });
    const r = { build: st };
    for (const which of ['dyn', 'all']) {
      const b = await page.evaluate(([n, w]) => window.__oseokBench(n, w), [N, which]);
      r[which] = { changeMs: med(b.change), idleMs: med(b.idle), jsMs: med(b.jsMs) };
    }
    r.fpsAll = await page.evaluate(() => window.__oseokFps(3, 'all'));
    res.ways[way] = r;
    console.log(`${BR} ${way}: 짓기 ${st && st.buildMs}ms · 첫 그림 ${st && st.firstPaintMs}ms · 글자 ${st && st.texts}(숫자 ${st && st.dyn}) · 숫자 바꿈 ${r.dyn.changeMs}ms(JS ${r.dyn.jsMs} · 안 바꿈 ${r.dyn.idleMs}) · 전부 바꿈 ${r.all.changeMs}ms(JS ${r.all.jsMs}) · 매 판 전부 바꿈 ${r.fpsAll.fps}판/초`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, `t1071-${BR}${DPR !== 1 ? '@' + DPR : ''}${TAG}.json`), JSON.stringify(res, null, 1));
  await browser.close(); srv.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
