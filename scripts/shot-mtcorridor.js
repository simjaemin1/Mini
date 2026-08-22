#!/usr/bin/env node
// ⓒ **뚫은 통로 안** — 시야 가림 투명화가 통로에서 어떻게 나오는지 그림으로 증명한다.
//   앞 벽(내 z보다 큰 띠)은 흐려지고, 뒤 벽(작은 띠)은 불투명하게 남고, 통로 속 플레이어가 보인다.
//
// ★통로는 **정본 부수기**(__mtDestroy)로 실제로 판다. 텔레포트로 기존 빈틈에 서지 않는다.
// ★"가장자리에서만 판다" 규칙은 **정본 술어**(__mtIsRock)로 매 삽마다 검사하고,
//   어기면 조용히 거르지 않고 **개수로 보고**한다(전례: 봉우리 3×3 채석 사건).
//
// 왜 −i 로 파는가
//   z = (wx+wy)/2 이고 z 가 큰 띠가 나중에(=앞에) 그려진다. 통로를 −i 로 파면
//   남쪽 옆벽 (i,j+1) 은 i+j 가 나보다 크므로 **앞 벽**, 북쪽 옆벽 (i,j−1) 은 **뒤 벽**이 된다.
//   즉 한 자리에서 앞·뒤가 동시에 보인다.
const path = require('path'), fs = require('fs'); const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/corr'; fs.mkdirSync(OUT, { recursive: true });
const DEPTH = +(process.env.DEPTH || 6);
const sleep = (m) => new Promise(r => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }

// ── 통로 자리 고르기 (정본 술어로) ────────────────────────────────────────
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const ZID = 'hanbando';
const rock = (i, j) => T.isRockCellLocal(ZID, i * 32 + 16, j * 32 + 16);
const water = (i, j) => T.isWaterCellLocal(ZID, i * 32 + 16, j * 32 + 16);
function pickSite() {
  // ★1차 시도는 빗나갔다: 입구가 카메라 쪽으로 열린 통로를 골랐더니 가림이 0 이었다.
  //   플레이어 z 에는 **+500 편향**이 있어(client.js L7170) 대략 **31셀 안쪽** 산은
  //   애초에 나를 못 덮는다. 그러니 "통로 속 플레이어가 앞 벽에 가려지는" 그림을 보려면
  //   플레이어 아래쪽(=i+j 가 큰 쪽) 대각선으로 **36셀 넘게 산이 이어져야** 한다.
  //   동시에 서쪽(−i) 가장자리는 가까워야 통로가 짧다.
  for (let j = 60; j < 700; j += 2) for (let i = 1760; i < 2240; i += 2) {
    if (!rock(i, j) || water(i, j)) continue;
    let wd = 0;                                   // 서쪽으로 몇 칸 가면 뚫리나
    while (wd < 12 && rock(i - wd - 1, j)) wd++;
    if (wd >= 12 || wd < 2) continue;             // 너무 깊지도, 가장자리에 붙지도 않게
    if (water(i - wd - 1, j)) continue;
    let deep = 0;                                 // 카메라 쪽(+i,+j) 대각선으로 산이 이어지나
    for (let k = 1; k <= 44; k++) if (rock(i + k, j + k)) deep++;
    if (deep < 38) continue;
    if (!rock(i, j + 1) || !rock(i, j - 1)) continue;   // 옆벽이 있어야 '통로'다
    return { i, j, wd };
  }
  return null;
}

const M = `(ms)=>new Promise(res=>{const t=[];let last=performance.now();const t0=last;
  const step=()=>{const n=performance.now();t.push(n-last);last=n;
    if(n-t0<ms)requestAnimationFrame(step);else{const s=t.slice().sort((a,b)=>a-b);
      res({med:+s[s.length>>1].toFixed(2)});}};requestAnimationFrame(step);})`;

(async () => {
  const site = pickSite();
  if (!site) { console.error('통로 자리를 못 찾았다'); process.exit(1); }
  const tgt = { i: site.i, j: site.j };                       // 플레이어가 설 통로 끝(안쪽)
  const digCells = [];
  for (let k = site.wd; k >= 0; k--) digCells.push([site.i - k, site.j]);   // 가장자리 → 안쪽
  console.log('플레이어 자리', tgt, '· 서쪽 가장자리까지', site.wd, '셀 · 삽질', digCells.length, '칸');

  fs.writeFileSync('/tmp/zw-corr.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-corr.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/corr.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: tgt.i * 32 + 16, y: tgt.j * 32 + 16, name: '통로' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);

  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) { try { const b = await pg.$(sel); if (b) { await b.click(); break; } } catch (e) {} }
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windForce = 0;
    window.__terrain19.natOff = true; window.__terrain19.propOff = true; window.__terrain19.decoOff = true; });
  await sleep(2500);
  await pg.screenshot({ path: path.join(OUT, 'A_부수기전.png') });

  // ── 삽질 — 입구부터 한 셀씩. 매 삽마다 정본 술어로 '가장자리인가'를 확인한다 ──
  const dig = await pg.evaluate((cells) => {
    const out = { dug: 0, illegal: 0, steps: [] };
    for (const [i, j] of cells) {
      const isRock = window.__mtIsRock(i, j);
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => window.__mtIsRock(i + dx, j + dy) === false);
      if (!isRock || !edge) { out.illegal++; out.steps.push({ i, j, isRock, edge, ok: false }); continue; }
      window.__mtDestroy([[i, j]]); out.dug++; out.steps.push({ i, j, ok: true });
    }
    return out;
  }, digCells);
  console.log('삽질:', JSON.stringify(dig).slice(0, 400));
  await sleep(4000);
  await pg.screenshot({ path: path.join(OUT, 'B_통로_투명화켬.png') });
  const on = await pg.evaluate(() => window.__mtOccDbg);

  // ── 편향 스윕 — 가림 판정의 플레이어 z 편향을 줄이며 그림·발동률을 함께 잰다 ──
  //   z 32 = 한 축 2셀. 500 = 현행(31셀).
  const sweep = [];
  for (const zb of (process.env.ZBS || '500,96,48,0').split(',').map(Number)) {
    await pg.evaluate((v) => window.__mtZOcc(v), zb);
    await sleep(1600);
    const d = await pg.evaluate(() => window.__mtOccDbg);
    // 이 자리에서 fade 가 켜지나 + 주변 961자리 발동률
    const rate = await pg.evaluate(() => {
      const me = window.__getMyAbs(); let hit = 0, tot = 0;
      for (let dx = -30; dx <= 30; dx += 2) for (let dy = -30; dy <= 30; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!r) continue; tot++; if (r.n > 0) hit++;
      }
      return { hit, tot, pct: tot ? +(hit / tot * 100).toFixed(1) : 0 };
    });
    await pg.screenshot({ path: path.join(OUT, `Z_${zb}.png`) });
    sweep.push({ zb, n: d.n, fade: d.fade, front: d.front, rate: rate.pct });
    console.log(`  편향 ${String(zb).padStart(3)} → 가림 ${d.n}장 · 알파진행 ${d.fade} · 앞 띠 ${d.front} · 주변 발동률 ${rate.pct}%`);
  }
  await pg.evaluate(() => window.__mtZOcc(500)); await sleep(800);

  await pg.evaluate(() => { window.__terrain19.occOff = true; }); await sleep(1500);
  await pg.screenshot({ path: path.join(OUT, 'C_통로_투명화끔.png') });
  const off = await pg.evaluate(() => window.__mtOccDbg);
  await pg.evaluate(() => { window.__terrain19.occOff = false; }); await sleep(1500);

  // 띠별 앞/뒤 흐림 표시 — 정본 그리기 경로에서
  await pg.evaluate(() => window.__mt3Rects(true)); await sleep(700);
  const rects = await pg.evaluate(() => {
    const me = window.__getMyAbs(); const mz = (me.x + me.y) * 0.5 + 500;
    const r = window.__mt3RectsGet() || [];
    const f = r.filter(x => x.z > mz), b = r.filter(x => x.z <= mz);
    return { front: f.length, frontFaded: f.filter(x => x.faded).length,
             back: b.length, backFaded: b.filter(x => x.faded).length };
  });
  await pg.evaluate(() => window.__mt3Rects(false));

  console.log('가림 상태 켬 =', JSON.stringify(on));
  console.log('가림 상태 끔 =', JSON.stringify(off));
  console.log('띠 흐림 =', JSON.stringify(rects));
  fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify({ site, tgt, dig, on, off, rects, sweep }, null, 1));
  console.log('저장:', OUT);
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0);
})().catch(e => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) {} } process.exit(1); });
