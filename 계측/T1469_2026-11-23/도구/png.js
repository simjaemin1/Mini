// png.js <in.svg> <out.png> — SVG 를 그대로 PNG 로(크롬)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => { const s = fs.readFileSync(process.argv[2], 'utf8'); const m = s.match(/width="(\d+)" height="(\d+)"/);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: +m[1], height: +m[2] }, deviceScaleFactor: 2 });
  await p.setContent(`<html><body style="margin:0">${s}</body></html>`); await p.screenshot({ path: process.argv[3], timeout: 180000 }); await b.close(); })();
