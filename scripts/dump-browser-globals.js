#!/usr/bin/env node
// === scripts/dump-browser-globals.js — 브라우저 전역 이름 고정 ================
// 이름 충돌 감사기가 쓰는 `scripts/browser-globals.json` 을 **실제 Chromium 에서** 뜬다.
// ★추측 금지: 손으로 적은 목록은 브라우저 판이 올라가면 조용히 낡는다.
//   갱신: node scripts/dump-browser-globals.js   (Playwright Chromium 필요)
'use strict';
const fs = require('fs'), path = require('path');
(async () => {
  const { chromium } = require('playwright');
  const b = await chromium.launch({ headless: true });
  const p = await (await b.newContext()).newPage();
  await p.goto('about:blank');
  const info = await p.evaluate(() => ({
    names: Object.getOwnPropertyNames(window).sort(),
    ua: navigator.userAgent,
  }));
  await b.close();
  const out = { generatedAt: new Date().toISOString(), userAgent: info.ua,
                note: '실제 Chromium 의 about:blank 전역. 갱신: node scripts/dump-browser-globals.js',
                names: info.names };
  const f = path.resolve(__dirname, 'browser-globals.json');
  fs.writeFileSync(f, JSON.stringify(out, null, 1));
  console.log(`전역 ${info.names.length}개 → ${f}`);
  console.log(`UA: ${info.ua}`);
})();
