#!/usr/bin/env node
// === scripts/t1071-oseok-tune.js — 세 길의 값 몇 개를 같은 돌 기준에 맞춘다(T1071 ② · 공정하게 셋 다) =============
//
//   기준 = tools/oseok/compare.py 가 구운 `ref-same-stone.png`(시안 식 · 브라우저와 같은 돌 타일) · `mask.png`(판 자리 2px 넓힘).
//   값 하나씩 격자를 돌며(좌표 내림 · 두 바퀴) 판 자리 평균 |Δ| 가 가장 작은 값을 고른다. 길마다 값은 2~4 개:
//     canvas — frost · 결 · 작은 글자(2배로 그려 줄임) ½px 그늘 · 1px 그늘 · 반대쪽 ½px 빛 알파 · 큰 글자(30px~) 1 · 2px 그늘 · 1px 빛 알파
//     svg    — frost · 흐림 · 높이(surfaceScale)
//     css    — frost · 그늘 알파 · 빛 알파
//   결과는 `<out>/tune-<브라우저>.json` — 모듈 기본값은 사람이 옮긴다(보고 §2).
// 실행: node scripts/t1071-oseok-tune.js [--out /tmp/t1071] [--ways canvas,svg,css]
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('--out', '/tmp/t1071');
const WAYS = arg('--ways', 'canvas,svg,css').split(',');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gray = (png) => { const g = new Float32Array(png.width * png.height); for (let i = 0; i < g.length; i++) g[i] = 0.299 * png.data[4 * i] + 0.587 * png.data[4 * i + 1] + 0.114 * png.data[4 * i + 2]; return g; };
const REF = gray(PNG.sync.read(fs.readFileSync(path.join(OUT, 'ref-same-stone.png'))));
const MSK = PNG.sync.read(fs.readFileSync(path.join(OUT, 'mask.png')));
const MI = []; for (let i = 0; i < MSK.width * MSK.height; i++) if (MSK.data[4 * i] > 127) MI.push(i);

const SPACE = {
  canvas: { p: { frost: 0.88, a1: 1, a2: 0.45, b1: 1, A1: 0.8, A2: 0.4, B1: 0.5, grain: 0.05 },
    g: { frost: [0.8, 0.84, 0.88, 0.92], a1: [0.6, 0.8, 1.0], a2: [0.2, 0.45, 0.7], b1: [0.5, 0.75, 1.0], A1: [0.4, 0.6, 0.8, 1.0], A2: [0, 0.2, 0.4, 0.6, 0.8], B1: [0, 0.25, 0.5, 0.75, 1.0], grain: [0, 0.05, 0.1] },
    c: (p) => ({ frost: p.frost, grain: p.grain, rims: [[0.5, 0.5, 0, p.a1], [1, 1, 0, p.a2], [-0.5, -0.5, 255, p.b1]], rimsBig: [[1, 1, 0, p.A1], [2, 2, 0, p.A2], [-1, -1, 255, p.B1]] }) },
  svg: { p: { frost: 0.84, blur: 0.8, scale: -2.2 }, g: { frost: [0.72, 0.76, 0.8, 0.84, 0.88, 0.92], blur: [0.4, 0.6, 0.8, 1.0, 1.3], scale: [-0.8, -1.5, -2.2, -3, -4] },
    c: (p) => ({ svgFrost: p.frost, svgBlur: p.blur, svgScale: p.scale }) },
  css: { p: { frost: 0.72, d: 0.55, l: 0.3 }, g: { frost: [0.6, 0.64, 0.68, 0.72, 0.76, 0.84], d: [0, 0.2, 0.4, 0.55, 0.7, 0.85], l: [0, 0.1, 0.2, 0.3, 0.4, 0.5] },
    c: (p) => ({ cssFrost: p.frost, cssShadow: `-1px -1px 0 rgba(0,0,0,${p.d}), 1px 1px 0 rgba(255,255,255,${p.l})` }) },
};

(async () => {
  const srv = http.createServer((q, r) => {
    const u = decodeURIComponent(q.url.split('?')[0]); const p = path.join(PUB, u);
    if (!p.startsWith(PUB) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const pw = require('playwright');
  const browser = await pw.chromium.launch({ headless: true, executablePath: pw.chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1080 } })).newPage();
  const score = async (way, c) => {
    await page.goto(`http://127.0.0.1:${srv.address().port}/oseok-demo.html?way=${way}&shot=1&fit=0&c=${encodeURIComponent(JSON.stringify(c))}`);
    for (let k = 0; k < 300; k++) { const st = await page.evaluate(() => window.__oseok); if (st && st.ready) break; await sleep(100); }
    const g = gray(PNG.sync.read(await page.screenshot()));
    let s = 0; for (const i of MI) s += Math.abs(g[i] - REF[i]); return s / MI.length;
  };
  const out = {};
  for (const way of WAYS) {
    const S = SPACE[way]; const p = Object.assign({}, S.p);
    let best = await score(way, S.c(p)); const start = best;
    for (let round = 0; round < 2; round++) {
      for (const k of Object.keys(S.g)) {
        for (const v of S.g[k]) {
          if (v === p[k]) continue;
          const q = Object.assign({}, p, { [k]: v }); const s = await score(way, S.c(q));
          if (s < best - 1e-3) { best = s; p[k] = v; }
        }
      }
    }
    out[way] = { start: +start.toFixed(2), best: +best.toFixed(2), p, c: S.c(p) };
    console.log(`${way}: 판 자리 평균 |Δ| ${start.toFixed(2)} → ${best.toFixed(2)} · ${JSON.stringify(p)}`);
  }
  fs.writeFileSync(path.join(OUT, `tune-chromium-${WAYS.join('-')}.json`), JSON.stringify(out, null, 1));
  await browser.close(); srv.close(); process.exit(0);
})().catch((e) => { console.log('실패:', e && e.stack); process.exit(1); });
