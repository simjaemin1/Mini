#!/usr/bin/env node
// 진단 — "산이 없고 색칠만 되어 있는 산 타일" [재민 실기 제보 2026-08-07]
//   바위 셀인데 그 자리에 산 스프라이트가 **안 서는** 셀을 픽셀로 센다.
//   산 픽셀은 색으로 안 세고 `mtOff` 손잡이 A/B 차이로 잰다(e2e-mountain 과 같은 규약).
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const SITE = { cx: parseInt(process.env.GAP_CX || "1750", 10), cy: parseInt(process.env.GAP_CY || "74", 10) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 100)); });
  procs.push(p); return p;
}
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zone-wrap-gap.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

function changedPct(a, b, box, thr) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4; t++;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d / 3 > (thr || 8)) n++;
  }
  return t ? n / t * 100 : 0;
}

(async () => {
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', '/tmp/zone-wrap-gap.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/gap.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  console.log('zone:', await waitHttp(`http://localhost:${ZPORT}/health`));
  await sleep(4000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(20000);
  for (let i = 0; i < 5; i++) { await page.keyboard.down('w'); await sleep(1500); await page.keyboard.up('w'); await sleep(150); }
  await sleep(2000);

  const shot = async (n) => { const p2 = `/tmp/gap-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
  const on = await shot('on');
  await page.evaluate(() => { window.__terrain19.mtOff = true; }); await sleep(1600);
  const off = await shot('off');
  await page.evaluate(() => { window.__terrain19.mtOff = false; }); await sleep(1600);

  // 화면 안 바위 셀을 모아 각 셀 상자의 산 픽셀 비율을 잰다
  const cam = await page.evaluate(() => window.__camCellLocal());
  const cells = [];
  for (let dx = -22; dx <= 22; dx++) for (let dy = -22; dy <= 22; dy++) cells.push([cam[0] + dx, cam[1] + dy]);
  const info = await page.evaluate((cs) => cs.map(([a, b]) => {
    const k = window.__tileStateAt(a, b); const s = window.__cellScreen(a, b);
    return { a, b, kind: k.kind, x: s.x, y: s.y };
  }), cells);
  const onScr = (v) => v.x > 90 && v.x < 1310 && v.y > 290 && v.y < 830;
  const rocks = info.filter((v) => v.kind === 'rock' && onScr(v));
  // ★반대 방향도 잰다 [재민 2026-08-07: "정확하게 산 셀인 곳에만 산이 있어야 해"]
  //   지금까지 "바위인데 산 없나"만 쟀다. "산인데 바위 아닌가"는 한 번도 안 쟀다 —
  //   한쪽만 재면 스프라이트를 크게 키워 덮개를 채우는 잘못된 해법이 통과한다.
  const land = info.filter((v) => v.kind !== 'rock' && v.kind !== 'water' && onScr(v));
  const boxOf = (r) => [Math.round(r.x - 26), Math.round(r.y - 12), Math.round(r.x + 26), Math.round(r.y + 12)];
  let bare = 0, covered = 0; const bareList = [];
  for (const r of rocks) {
    // 셀 다이아 속살(±26,±12) — 이웃 셀의 산이 새어 들지 않는 크기
    const pct = changedPct(on, off, boxOf(r));
    if (pct < 5) { bare++; bareList.push({ cell: [r.a, r.b], pct: +pct.toFixed(1) }); } else covered++;
  }
  // ★넘침을 둘로 가른다. 섞어 세면 고칠 것을 못 고른다.
  //   ⓐ **발치 넘침(진짜 결함)** — 산 발치가 풀밭에 얹혔다. 걸어갈 수 있는데 산이 보인다.
  //   ⓑ **몸통 가림(정상)** — 산 몸통이 제 뒤(북서) 풀밭을 가린다. 산이 원래 하는 일이고,
  //      재민이 반투명으로 따로 답을 준 건이다.
  //   가르는 규칙: 스프라이트는 앵커에서 **화면 위쪽(iso y 작은 쪽 = 북서)** 으로 뻗는다.
  //   ⇒ 덮인 풀 셀의 **남동쪽**에 바위가 있으면 그 산의 몸통에 가린 것(ⓑ)이고,
  //     남동쪽에 바위가 없으면 그 자리에 발치가 얹힌 것(ⓐ)이다.
  const rockSet = new Set(info.filter((v) => v.kind === 'rock').map((v) => v.a + '_' + v.b));
  const behindRock = (a, b) => {           // 남동(+wx,+wy) 부채꼴에 바위가 있나
    for (let k = 1; k <= 26; k++) for (let w = -4; w <= 4; w++) {
      if (rockSet.has((a + k + w) + '_' + (b + k - w))) return true;
    }
    return false;
  };
  let spillFoot = 0, spillBody = 0; const spillList = [];
  for (const r of land) {
    const pct = changedPct(on, off, boxOf(r));
    if (pct < 25) continue;
    if (behindRock(r.a, r.b)) spillBody++;
    else { spillFoot++; spillList.push({ cell: [r.a, r.b], pct: +pct.toFixed(0) }); }
  }
  const spill = spillFoot;
  console.log(`\n화면 안 바위 셀 ${rocks.length}개 · 뭍(비바위) 셀 ${land.length}개`);
  console.log(`  산이 덮은 셀   ${covered}  (${(covered / rocks.length * 100).toFixed(1)}%)`);
  console.log(`  ★맨 바위 셀   ${bare}  (${(bare / rocks.length * 100).toFixed(1)}%)  ← 색칠만 되고 산이 없다`);
  console.log(`  ★★발치 넘침  ${spillFoot}/${land.length}  (${(spillFoot / Math.max(1, land.length) * 100).toFixed(1)}%)  ← 진짜 결함: 걸을 수 있는데 산 발치가 얹혔다`);
  console.log(`     몸통 가림  ${spillBody}/${land.length}  (${(spillBody / Math.max(1, land.length) * 100).toFixed(1)}%)  ← 정상: 산이 제 뒤(북서)를 가린다`);
  console.log(`  맨 바위 표본: ${JSON.stringify(bareList.slice(0, 8))}`);
  console.log(`  발치 넘침 표본: ${JSON.stringify(spillList.slice(0, 8))}`);
  const mt = await page.evaluate(() => window.__mtDbg);
  console.log(`  __mtDbg: ${JSON.stringify(mt)}`);
  // 맨 바위 셀이 능선 중심에서 얼마나 떨어져 있나 — 밴드 가장자리 가설 검증
  if (bareList.length) {
    const probe = await page.evaluate(() => window.__mtProbe());
    const d = bareList.map((b) => {
      let m = 1e9; for (const s of probe) { const dd = Math.hypot(s.lcx - b.cell[0], s.lcy - b.cell[1]); if (dd < m) m = dd; }
      return +m.toFixed(1);
    }).sort((a, b) => a - b);
    console.log(`  맨 바위 셀 → 가장 가까운 세그먼트 거리(셀): 중앙값 ${d[d.length >> 1]} · 최소 ${d[0]} · 최대 ${d[d.length - 1]}`);
  }
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
