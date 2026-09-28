#!/usr/bin/env node
// === scripts/t487-seasons.js — 사계 한 장(재민 눈) [T487 2026-09-28] ======================
//
// ★카드 ⑤ "헤드리스로 같은 자리(마을 한복판 + 들판) × 봄·여름·가을·겨울(적설 1) 넷 → 한 장 2×2 · 재민 눈"
//   하네스가 아니다(판정 0 · 이름이 `test-`·`e2e-` 가 아니라 러너·린트가 안 줍는다) — **그림을 만드는 자**다.
//
// ★세계를 바꾸지 않는다. 세우는 것은 테스트 전용 문 둘뿐이다:
//   `__e2e_clock`(그 철 한가운데 낮) · `__e2e_snow`(겨울만 적설 1 — 카드가 그 한 판을 1 로 적었다 · 나머지 셋은 세계 값 그대로)
//   달력(`myCalendar`)은 **입장 때 온다**(welcome) ⇒ 철마다 다시 들어간다 — 수관 철 판이 그 달력을 읽는다.
//   손잡이 `T487_SNOW=1`(카드의 손잡이 하나)로 띄운다 — 지면·수관·배지 ℃ 가 전부 그 한 칸을 본다.
//
// 실행: node scripts/t487-seasons.js <out.png>      (NODE_PATH 에 playwright · pngjs 는 저장소 것)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const Ev = require(path.join(ROOT, 'server', 'events.js'));
const OUT = process.argv[2] || '/tmp/T487_사계.png';
const TMP = path.join(path.dirname(OUT), 't487-seasons-shots');
fs.mkdirSync(TMP, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t487-seasons-${process.pid}.db`, CDB = `/tmp/t487-seasons-c-${process.pid}.db`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
// 하늘 시계를 한낮에 묶는다(e2e-tilestate · e2e-snow 래퍼와 같은 문법) — 네 장이 같은 빛이어야 철만 갈린다
const WRAP = `/tmp/zone-wrap-seasons-${process.pid}.js`;
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
require(path.join(ROOT,'server','zone.js'));`);
// 철마다 **그 철 한가운데 날**(첫 해) — 날짜를 지어내지 않고 달력 정본에서 뽑는다
function midOf(season) {
  let d = 0; while (Ev.calendarOf(d).season !== season) d++;
  return d + Math.floor(Ev.calendarOf(d).seasonDays / 2);
}
const SEASONS = [['spring', '봄'], ['summer', '여름'], ['autumn', '가을'], ['winter', '겨울']];

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot(WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T487_SNOW: '1' });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 });
  console.log('central', cu.ok, '· zone', zu.ok);
  if (!cu.ok || !zu.ok) process.exit(2);
  const { rows } = await FX.waitVillages(ZDB);
  const V = rows[0];
  console.log('마을', V && `${V.name}(${V.cx},${V.cy})`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  const enter = async () => {
    await page.goto(`http://localhost:${CPORT}/`);
    await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
    try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
    return (await FX.waitInWorld(page)).ok;
  };
  const shots = [];
  // 자리 = 마을 한복판에서 들판 쪽으로 반 화면(마을과 둘레 밭이 한 화면에 든다) — 한 번 정해 네 철이 같이 쓴다
  const SPOT = [V.cx * 32 + 16 + (+process.env.T487_SPOT_DX || 0), V.cy * 32 + 16 + (+process.env.T487_SPOT_DY || 0)];
  for (const [se, ko] of SEASONS) {
    const day = midOf(se);
    // ① 시계·적설을 먼저 세운다(존 전체 값) → ② 다시 들어가 **그날의 달력**을 입장 때 받는다
    if (!(await enter())) { console.log('입장 실패', se); continue; }
    const fx = await FX.setClock(page, { day, night: false });
    await page.evaluate((v) => window.__sendPrimary({ type: '__e2e_snow', snow: v }), se === 'winter' ? 1 : null);
    await sleep(1500);
    if (!(await enter())) { console.log('재입장 실패', se); continue; }
    await FX.setClock(page, { day, night: false });   // 다시 들어온 몸이 초당 gauges 로 같은 날을 받을 때까지
    await page.evaluate(() => { window.__terrain19.windOff = true; });
    await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
    await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), SPOT);
    await sleep(9000);                                  // 카메라 트윈 · 타일 굽기 · 철 판 그림 받기
    const info = await page.evaluate(() => ({ cal: window.__calendar ? window.__calendar() : null, wx: window.__wx ? window.__wx() : null,
      badge: (document.getElementById('wxBadge') || {}).textContent, calB: (document.getElementById('calBadge') || {}).textContent }));
    const p = path.join(TMP, `${se}.png`);
    await page.screenshot({ path: p });
    shots.push({ se, ko, day, p, info, fx: fx.ok });
    console.log(JSON.stringify({ se, day, fx: fx.ok, season: info.cal && info.cal.season, snow: info.wx && info.wx.snow, tempC: info.wx && info.wx.tempC,
      badge: (info.badge || '').trim(), cal: (info.calB || '').trim() }));
  }
  await browser.close();
  // ── 2×2 한 장 — 좌상 봄 · 우상 여름 · 좌하 가을 · 우하 겨울 ──
  const { PNG } = require('pngjs');
  const ims = shots.map((s) => PNG.sync.read(fs.readFileSync(s.p)));
  const w = ims[0].width, h = ims[0].height, G = 8;
  const out = new PNG({ width: w * 2 + G, height: h * 2 + G });
  out.data.fill(255);
  ims.forEach((im, k) => {
    const ox = (k % 2) * (w + G), oy = ((k / 2) | 0) * (h + G);
    for (let y = 0; y < h; y++) im.data.copy(out.data, ((oy + y) * out.width + ox) * 4, y * w * 4, (y + 1) * w * 4);
  });
  fs.writeFileSync(OUT, PNG.sync.write(out));
  console.log('→', OUT, `${out.width}x${out.height}`, errs.length ? `pageerror ${errs.length}: ${errs[0]}` : 'pageerror 0');
  shutdown(); try { fs.unlinkSync(WRAP); } catch (e) { }
  process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
