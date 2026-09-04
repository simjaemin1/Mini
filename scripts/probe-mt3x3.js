#!/usr/bin/env node
// =============================================================================
// 3×3 산 · 한 칸 부수기 실증 [재민 2026-08-07]
//
// 재민: *"3×3 영역만큼 산이 존재한다면 해당 9개 타일에만 산이 있어야 해. 북쪽 칸 하나를
//        부순다면 U자가 될 텐데, 그래도 딱 8개 타일만? 칼로 자른 듯한 디자인도 아니면서?"*
//
// ★말로 답하지 않고 **만들어서 잰다.** `__mtDestroy` 로 큰 바위 덩어리를 깎아 3×3 섬을
//   만들고, 두 수치를 잰 뒤, 북쪽 한 칸을 더 부숴 8칸으로 만들고 다시 잰다.
//     ① 산인데 갈색으로 드러남 (바위 셀에 산이 없다)
//     ② 평지인데 산이 침범    (비바위 셀에 산이 보인다)
//   그림도 같이 남긴다 — 수치가 0 이어도 '칼로 자른 듯'하면 그건 눈으로 봐야 한다.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const SITE = { cx: +(process.env.CX || 1750), cy: +(process.env.CY || 74) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  procs.push(p); return p;
}
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zw-3x3.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

function changedPct(a, b, box) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = Math.max(0, y0); y < Math.min(a.height, y1); y++) for (let x = Math.max(0, x0); x < Math.min(a.width, x1); x++) {
    const i = (y * a.width + x) * 4; t++;
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d / 3 > 8) n++;
  }
  return t ? n / t * 100 : 0;
}

(async () => {
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('zone', '/tmp/zw-3x3.js', { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/m3.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(4000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(22000);

  const shot = async (n) => { const p2 = `/tmp/m3-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };

  // ── 화면 안 바위 덩어리 한가운데를 골라 3×3 만 남기고 다 부순다
  const setup = await page.evaluate(() => {
    const cam = window.__camCellLocal();
    // 카메라 주변에서 바위가 가장 두꺼운 자리를 중심으로
    let best = null;
    for (let dx = -12; dx <= 12; dx++) for (let dy = -12; dy <= 12; dy++) {
      const a = cam[0] + dx, b = cam[1] + dy;
      let n = 0;
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        if (window.__tileStateAt(a + i, b + j).kind === 'rock') n++;
      const s = window.__cellScreen(a, b);
      if (n === 9 && s && s.x > 350 && s.x < 1050 && s.y > 380 && s.y < 700) {
        const d = Math.hypot(dx, dy);
        if (!best || d < best.d) best = { a, b, d, sx: s.x, sy: s.y };
      }
    }
    return best;
  });
  if (!setup) { console.log('3×3 자리를 못 찾았다'); await browser.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(1); }
  console.log(`3×3 중심 셀 (${setup.a},${setup.b}) · 화면 (${Math.round(setup.sx)},${Math.round(setup.sy)})`);

  const keep = new Set();
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) keep.add((setup.a + i) + '_' + (setup.b + j));
  const killList = await page.evaluate((o) => {
    const out = [];
    for (let dx = -26; dx <= 26; dx++) for (let dy = -26; dy <= 26; dy++) {
      const a = o.a + dx, b = o.b + dy;
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
      if (window.__tileStateAt(a, b).kind === 'rock') out.push([a, b]);
    }
    return out;
  }, setup);
  console.log(`주변 바위 ${killList.length}셀 제거 → 3×3 섬만 남긴다`);
  await page.evaluate((cs) => window.__mtDestroy(cs), killList);
  await sleep(2200);

  // ★`__mtDestroy` 는 **렌더 층만** 지운다(지형 데이터 무접촉이 규약이라 그렇다).
  //   그래서 `__tileStateAt` 은 부순 셀도 여전히 'rock' 이라고 답한다.
  //   측정에서 부순 셀을 바위로 세면 ① 이 93% 로 나온다 — 계측기가 틀린 것이다.
  const dead = new Set(killList.map(([a, b]) => a + '_' + b));
  async function measure(label, cells) {
    const on = await shot(label);
    await page.evaluate(() => { window.__terrain19.mtOff = true; }); await sleep(1500);
    const off = await shot(label + '-off');
    await page.evaluate(() => { window.__terrain19.mtOff = false; }); await sleep(1500);
    const info = await page.evaluate((o) => {
      const out = [];
      for (let dx = -8; dx <= 8; dx++) for (let dy = -8; dy <= 8; dy++) {
        const a = o.a + dx, b = o.b + dy;
        const k = window.__tileStateAt(a, b); const s = window.__cellScreen(a, b);
        if (!s) continue;
        out.push({ a, b, kind: k.kind, x: s.x, y: s.y });
      }
      return out;
    }, setup);
    const boxOf = (r) => [Math.round(r.x - 26), Math.round(r.y - 12), Math.round(r.x + 26), Math.round(r.y + 12)];
    let bare = 0, rockN = 0, spill = 0, landN = 0;
    for (const r of info) {
      if (r.kind === 'water') continue;
      const isRock = r.kind === 'rock' && !dead.has(r.a + '_' + r.b);
      const pct = changedPct(on, off, boxOf(r));
      if (isRock) { rockN++; if (pct < 5) bare++; }
      else { landN++; if (pct >= 25) spill++; }   // 부순 셀은 이제 '평지' 다 — 여기 산이 남으면 ② 로 잡힌다
    }
    console.log(`\n[${label}] 바위 ${rockN}셀 · 뭍 ${landN}셀`);
    console.log(`   ① 산인데 갈색 : ${bare}/${rockN} = ${(bare / Math.max(1, rockN) * 100).toFixed(1)}%`);
    console.log(`   ② 평지인데 산 : ${spill}/${landN} = ${(spill / Math.max(1, landN) * 100).toFixed(1)}%`);
    const segs = await page.evaluate((o) => (window.__mtProbe() || [])
      .filter((g) => Math.abs(g.lcx - o.a) <= 3 && Math.abs(g.lcy - o.b) <= 3)
      .map((g) => ({ c: [g.lcx, g.lcy], nm: g.nm, sc: +g.sc.toFixed(2), vy: +g.vy.toFixed(2) })), setup);
    console.log(`   세그먼트 ${segs.length}장: ${JSON.stringify(segs.slice(0, 10))}`);
    return { bare, rockN, spill, landN };
  }

  await measure('3x3', 9);
  // 북쪽 한 칸 부수기 — 화면 위쪽 = (a-1,b-1)
  await page.evaluate((o) => window.__mtDestroy([[o.a - 1, o.b - 1]]), setup);
  dead.add((setup.a - 1) + '_' + (setup.b - 1));
  await sleep(2200);
  await measure('U자', 8);

  // 잘라 보기 좋게 crop
  for (const n of ['3x3', 'U자']) {
    const src = PNG.sync.read(fs.readFileSync(`/tmp/m3-${n}.png`));
    const w = 420, h = 320;
    const x0 = Math.max(0, Math.round(setup.sx - w / 2)), y0 = Math.max(0, Math.round(setup.sy - h * 0.62));
    const out = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = ((y0 + y) * src.width + (x0 + x)) * 4, di = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out.data[di + c] = src.data[si + c];
    }
    fs.writeFileSync(`/tmp/m3crop-${n === '3x3' ? 'a' : 'b'}.png`, PNG.sync.write(out));
  }
  console.log('\n그림: /tmp/m3crop-a.png (3×3) · /tmp/m3crop-b.png (U자)');
  await browser.close();
  for (const p of procs) { try { p.kill(); } catch (e) { } }
  process.exit(0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
