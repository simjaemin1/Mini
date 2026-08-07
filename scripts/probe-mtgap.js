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
  if (process.env.GAP_KNOBS) {
    await page.evaluate((k) => Object.assign(window.__terrain19, JSON.parse(k)), process.env.GAP_KNOBS);
    await sleep(1600);
    console.log('  손잡이:', process.env.GAP_KNOBS);
  }
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
  // ★★[재민 2026-08-07 지적] 앞선 분류(남동 부채꼴 w∈[-4,4])는 **너무 헐거웠다** —
  //   옆으로 5셀 퍼진 발치까지 "몸통에 가려진 것"으로 삼켜 0.0% 를 냈다.
  //   규칙으로 가르는 대신 **거리로 잰다**: 산이 덮은 비바위 셀이 바위에서 몇 셀 떨어졌나.
  //   이건 해석의 여지가 없다 — "정말 미세한 오차"라는 재민 규격을 셀 수로 바로 옮긴다.
  // ★★넘침 분류는 **정본에게 묻는다**(__mtSpillAt) — 규칙으로 가르려던 두 번의 시도가 다 헐거웠다.
  //   앵커의 세로 위치 v0 기준: 셀이 그보다 아래면 앞 치맛자락(결함), 위면 몸통 뒤 가림(정상).
  const spill = await page.evaluate((cs) => cs.map(([a, b]) => window.__mtSpillAt(a, b)), land.map((r) => [r.a, r.b]));
  const covOut = [], footOut = [];
  for (let i = 0; i < land.length; i++) {
    const r = land[i], sp = spill[i]; if (!sp || !sp.cov) continue;
    const pct = changedPct(on, off, boxOf(r));
    if (pct < 25) continue;
    covOut.push({ cell: [r.a, r.b], cov: sp.cov, foot: sp.foot, offRock: sp.offRock });
    if (sp.foot > 0 || sp.offRock > 0) footOut.push({ cell: [r.a, r.b], foot: sp.foot, offRock: sp.offRock });
  }
  console.log(`\n화면 안 바위 셀 ${rocks.length}개 · 뭍(비바위) 셀 ${land.length}개`);
  console.log(`  산이 덮은 셀   ${covered}  (${(covered / rocks.length * 100).toFixed(1)}%)`);
  console.log(`  ★맨 바위 셀   ${bare}  (${(bare / rocks.length * 100).toFixed(1)}%)  ← 색칠만 되고 산이 없다`);
  console.log(`  ★★산이 덮은 비바위 셀 ${covOut.length}/${land.length} (${(covOut.length / Math.max(1, land.length) * 100).toFixed(1)}%)`);
  console.log(`     (참고 — 그중 앞 치맛자락/비바위 앵커 ${footOut.length}, 나머지는 몸통이 덮은 것)`);
  console.log(`\n  ★★★재민 규격 두 수치 — 둘 다 0% 에 가까워야 한다`);
  console.log(`     ① 산인데 갈색으로 드러남 : ${bare}/${rocks.length} = ${(bare / Math.max(1, rocks.length) * 100).toFixed(1)}%`);
  console.log(`     ② 평지인데 산이 침범     : ${covOut.length}/${land.length} = ${(covOut.length / Math.max(1, land.length) * 100).toFixed(1)}%`);
  console.log(`  맨 바위 표본: ${JSON.stringify(bareList.slice(0, 8))}`);
  console.log(`  결함 표본: ${JSON.stringify(footOut.slice(0, 8))}`);
  // ★[재민 "산 하나가 아니라 산 9개네?"] 셀당 몇 장이 서는지, 배율이 어떤지 센다
  const grain = await page.evaluate(() => {
    const cam = window.__camCellLocal();
    const segs = (window.__mtProbe() || []).filter((g) => Math.abs(g.lcx - cam[0]) <= 18 && Math.abs(g.lcy - cam[1]) <= 18);
    let rock = 0;
    for (let dx = -18; dx <= 18; dx++) for (let dy = -18; dy <= 18; dy++)
      if (window.__tileStateAt(cam[0] + dx, cam[1] + dy).kind === 'rock') rock++;
    const sc = segs.map((g) => g.sc).sort((a, b) => a - b);
    const tier = {}; for (const g of segs) tier[g.ridge] = (tier[g.ridge] || 0) + 1;
    const q = (p2) => sc.length ? +sc[Math.min(sc.length - 1, Math.floor(sc.length * p2))].toFixed(2) : 0;
    // 배율 1 = 발자국 약 10셀. 스프라이트 하나가 덮는 셀 수 ≈ (CROSS_U*sc)^2*0.5
    return { rock, segs: segs.length, perCell: +(segs.length / Math.max(1, rock)).toFixed(2),
             sc: { p10: q(0.1), med: q(0.5), p90: q(0.9), max: q(0.999) }, tier,
             minCnt: sc.filter((v) => v <= 0.29).length };
  });
  console.log(`\n  ★결/알갱이 — 바위 ${grain.rock}셀에 세그먼트 ${grain.segs}장 = **셀당 ${grain.perCell}장**`);
  console.log(`     배율 하위10% ${grain.sc.p10} · 중앙값 ${grain.sc.med} · 상위10% ${grain.sc.p90} · 최대 ${grain.sc.max}`);
  console.log(`     하한(0.28)에 눌린 장수 ${grain.minCnt}/${grain.segs} (${(grain.minCnt / Math.max(1, grain.segs) * 100).toFixed(0)}%) · 계층 ${JSON.stringify(grain.tier)}`);
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
