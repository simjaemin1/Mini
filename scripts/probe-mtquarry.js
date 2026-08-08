#!/usr/bin/env node
// =============================================================================
// 채석 — **겉면만** 깎아 들어갈 때 봉우리가 사라지나, 낮아지나 [재민 2026-08-07]
//
// 재민: *"평지와 맞닿은 부분만 부술 수 있는 거 알지..? 그래도 그래?"*
//   → 그래도 그랬다. 겉면 12셀을 깎자 배율 2.18 봉우리가 통째로 사라졌다(팝).
//     원인은 계층의 `dE < minD` 딱딱한 문턱. 그걸 없앤 뒤 이걸로 다시 잰다.
//
// ★재는 것: 라운드마다 그 봉우리의 배율. **0 으로 뚝 떨어지면 팝**, 조금씩 줄면 물러남.
//
// ⚠`__mtDestroy` 는 **렌더 층만** 지운다(지형 데이터 무접촉 규약). `__tileStateAt` 은
//   부순 셀도 여전히 'rock' 이라고 답하므로, 하네스가 죽은 셀을 **직접 들고** 있어야 한다.
//   1차 판에서 이걸 빠뜨려 2~6 라운드가 같은 12셀을 다시 고르며 제자리걸음했다.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const SITE = { cx: +(process.env.CX || 1750), cy: +(process.env.CY || 74) };
const RAD = +(process.env.RAD || 8), BITE = +(process.env.BITE || 10), ROUNDS = +(process.env.ROUNDS || 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
fs.writeFileSync('/tmp/zw-qry.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

(async () => {
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  boot('/tmp/zw-qry.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/qry.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0', WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '산' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(4000);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) { }
  }
  await sleep(24000);

  // ★[환경 방어] 롤백된 옛 코드로 재고 수치를 내면 안 된다 — 오늘 컨테이너가 다섯 번 되돌아갔다
  const fresh = await pg.evaluate(() => ({ fit: window.__terrain19 && window.__terrain19.fitOff !== undefined }));
  if (!fresh.fit) { console.log('\n★★낡은 코드다 — git checkout -B main origin/main 후 다시.'); await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(2); }

  const big = await pg.evaluate(() => {
    const cam = window.__camCellLocal();
    const segs = (window.__mtProbe() || []).filter((g) => Math.abs(g.lcx - cam[0]) <= 16 && Math.abs(g.lcy - cam[1]) <= 16);
    if (!segs.length) return null;
    segs.sort((a, b) => b.sc - a.sc);
    return { a: segs[0].lcx, b: segs[0].lcy, sc: +segs[0].sc.toFixed(2), nm: segs[0].nm };
  });
  if (!big) { console.log('세그먼트 없음'); await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(1); }
  console.log(`가장 큰 봉우리 — 셀 (${big.a},${big.b}) · ${big.nm} · 배율 ${big.sc}\n`);

  const dead = new Set();                       // ★하네스가 죽은 셀을 직접 들고 있는다
  const state = async () => pg.evaluate((o) => {
    const segs = (window.__mtProbe() || []).filter((g) => Math.abs(g.lcx - o.a) <= o.r && Math.abs(g.lcy - o.b) <= o.r);
    const sc = segs.map((g) => g.sc).sort((p, q) => q - p);
    const near = segs.filter((g) => Math.abs(g.lcx - o.a) <= 2 && Math.abs(g.lcy - o.b) <= 2).map((g) => g.sc).sort((p, q) => q - p);
    return { n: segs.length, max: sc.length ? +sc[0].toFixed(2) : 0, peak: near.length ? +near[0].toFixed(2) : 0 };
  }, { a: big.a, b: big.b, r: RAD });

  const s0 = await state();
  console.log('라운드  깎은겉면   반경장수  최대배율  ★그봉우리');
  console.log(`   0        0        ${String(s0.n).padStart(4)}   ${String(s0.max).padStart(6)}   ${String(s0.peak).padStart(7)}`);
  await pg.screenshot({ path: '/tmp/qry2-0.png' });

  let cut = 0;
  for (let r = 1; r <= ROUNDS; r++) {
    const cells = await pg.evaluate((o) => {
      const dd = new Set(o.dead);
      const isRock = (a, b) => window.__tileStateAt(a, b).kind === 'rock' && !dd.has(a + '_' + b);
      const out = [];
      for (let dx = -26; dx <= 26; dx++) for (let dy = -26; dy <= 26; dy++) {
        const a = o.a + dx, b = o.b + dy;
        if (!isRock(a, b)) continue;
        if (isRock(a + 1, b) && isRock(a - 1, b) && isRock(a, b + 1) && isRock(a, b - 1)) continue;  // 겉면만
        out.push({ a, b, d: Math.hypot(dx, dy) });
      }
      out.sort((p, q) => p.d - q.d);
      return out.slice(0, o.n).map((v) => [v.a, v.b]);
    }, { a: big.a, b: big.b, n: BITE, dead: [...dead] });
    if (!cells.length) break;
    await pg.evaluate((cs) => window.__mtDestroy(cs), cells);
    for (const [a, b] of cells) dead.add(a + '_' + b);
    cut += cells.length;
    await sleep(1900);
    const s = await state();
    console.log(`   ${r}       ${String(cut).padStart(3)}        ${String(s.n).padStart(4)}   ${String(s.max).padStart(6)}   ${String(s.peak).padStart(7)}`);
    await pg.screenshot({ path: `/tmp/qry2-${r}.png` });
  }
  console.log('\n★그봉우리 = 앵커 ±2셀 안 최대 배율. 0 으로 뚝 떨어지면 팝, 조금씩 줄면 물러남이다.');
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(0);
})().catch((e) => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) { } } process.exit(1); });
