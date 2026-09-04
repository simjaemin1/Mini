#!/usr/bin/env node
// MT3_PAD 라운드 1항 — **추정 검증**. 고치기 전에 먼저 잰다.
//
// 추정: _mt3Field 는 청크(16셀)+PAD 12 = 40셀 창 안에서만 챔퍼 거리장을 돌리고
//   창 밖을 '바위 아님'으로 본다. 그래서 dE 가 창 경계까지의 거리로 잘리고,
//   h = HMAX(1−e^(−dE/LAM)) 가 35m 에 못 미쳐 포화한다. 게다가 그 상한이 청크 안
//   위치에 따라 달라져 **16셀 주기 높이 변조**가 생긴다.
//
// 재는 것
//   ⓐ 산괴 깊은 곳의 **실제 마루 높이** (35m 대비)
//   ⓑ 높이장을 i·j 축으로 훑어 **16셀 주기**가 서는지 (스펙트럼)
//   ⓒ 청크 경계에서 높이 **단차**(창 잘림이 있으면 경계에서 튄다)
// 추정이 틀리면 여기서 멈추고 보고한다.
const path = require('path'), fs = require('fs'); const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/pad'; fs.mkdirSync(OUT, { recursive: true });
const sleep = (m) => new Promise(r => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }

// 산괴 한가운데를 정본 술어로 고른다 — 가장자리에서 가장 먼 셀
const T = require(path.join(ROOT, 'server', 'terrain.js'));
const ZID = 'hanbando';
const rock = (i, j) => T.isRockCellLocal(ZID, i * 32 + 16, j * 32 + 16);
function deepest() {
  const I0 = 1740, J0 = 0, W = 520, H = 720;
  const R = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) R[j * W + i] = rock(I0 + i, J0 + j) ? 1 : 0;
  const INF = 1e6, d = new Float32Array(W * H);
  for (let k = 0; k < W * H; k++) d[k] = R[k] ? INF : 0;
  // ★★[창 밖 INF 족 버그 수리 2026-08-25] 창 밖을 INF(=미해결 바위)로 보면 창 가장자리에
  //   걸친 셀의 dE 가 바깥 땅에 안 잘려 **부푼다**(measure-mtscale 에서 dmax 47.0 → 35.3 으로 정정).
  //   ⇒ 창 밖은 **땅(0)** 으로 본다 — 깊이의 하한이 되어 절대 부풀지 않는다.
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : d[j * W + i];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
  let best = 0, bi = 0, bj = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (d[j * W + i] < 1e5 && d[j * W + i] > best) { best = d[j * W + i]; bi = I0 + i; bj = J0 + j; }
  return { i: bi, j: bj, dE: +best.toFixed(1) };
}

function spectrum(v) {   // 실수열의 주기 성분 — 8~40셀 대역에서 가장 강한 주기와 그 배수
  const n = v.length, m = v.reduce((a, b) => a + b, 0) / n;
  const y = v.map((x, i) => (x - m) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))));
  const P = [];
  for (let k = 1; k < n / 2; k++) {
    let re = 0, im = 0;
    for (let i = 0; i < n; i++) { const a = -2 * Math.PI * k * i / n; re += y[i] * Math.cos(a); im += y[i] * Math.sin(a); }
    P.push({ per: n / k, p: re * re + im * im });
  }
  const band = P.filter(x => x.per >= 6 && x.per <= 48);
  if (!band.length) return null;
  const med = band.map(x => x.p).sort((a, b) => a - b)[band.length >> 1] || 1e-9;
  const top = band.reduce((a, b) => (b.p > a.p ? b : a));
  const at16 = band.reduce((a, b) => (Math.abs(b.per - 16) < Math.abs(a.per - 16) ? b : a));
  return { topPer: +top.per.toFixed(1), topX: +(top.p / med).toFixed(1), x16: +(at16.p / med).toFixed(1), per16: +at16.per.toFixed(1) };
}

(async () => {
  const site = deepest();
  console.log('산괴 최심부 셀', site, '(전역 챔퍼 기준 · 여기서 h 가 35m 에 가장 가까워야 한다)');
  fs.writeFileSync('/tmp/zw-pad.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-pad.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/pad.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.i * 32 + 16, y: site.j * 32 + 16, name: '최심부' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 200)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다.
  //   ⚠옛 사다리(`#startBtn`·"시작"·"입장"·게스트) 네 칸 중 실제로 문 것은 **"입장" 한 칸**이었다.
  //   앞 칸 "시작"은 숨은 「새로 시작」에 걸려 click 이 **시간초과**로 죽었고, 그 30초가 **우연히**
  //   로비의 `/zones` 응답을 기다려 주고 있었다(존 목록 전엔 이 버튼이 `disabled` 다 — T61·T68 의 그 흔들림).
  //   ⇒ 우연을 지우는 대신 기다림을 **말로** 적는다: 버튼이 살아난 뒤에 누른다.
  //   ★기다림은 **두 가지**다: 버튼이 살아나는 것(`disabled`)과 **손잡이가 걸리는 것**
  //     (`onclick` 은 `30-n-net.js` 의 `boot()` 이 건다 — 그 전에 누르면 아무 일도 안 난다).
  await pg.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await pg.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(20000);

  // 존 로컬 셀 좌표로 바꿔서 격자 조회
  const base = await pg.evaluate(() => { const c = window.__zoneMetaDbg ? window.__zoneMetaDbg() : null; return c; }).catch(() => null);
  const W = 128, H = 128;
  const g = await pg.evaluate((a) => window.__mtHeightGrid(a.x, a.y, a.w, a.h),
    { x: site.i - Math.floor(W / 2), y: site.j - Math.floor(H / 2), w: W, h: H });
  if (!g) { console.error('격자 조회 실패'); process.exit(1); }
  const at = (a, b) => g[b * W + a];
  const mx = g.reduce((p, q) => Math.max(p, q), 0);
  console.log(`\nⓐ 격자 ${W}×${H} 최대 높이 = ${mx.toFixed(2)}m  (HMAX 35m 대비 ${(mx / 35 * 100).toFixed(0)}%)`);

  // ⓑ 16셀 주기 — 가로/세로 여러 줄의 스펙트럼을 모아 본다
  const rowsX = [], rowsY = [];
  for (let b = 8; b < H - 8; b += 6) rowsX.push(spectrum(Array.from({ length: W }, (_, a) => at(a, b))));
  for (let a = 8; a < W - 8; a += 6) rowsY.push(spectrum(Array.from({ length: H }, (_, b) => at(a, b))));
  const agg = (rs) => { const v = rs.filter(Boolean); return {
    x16: +(v.reduce((s, r) => s + r.x16, 0) / v.length).toFixed(1),
    topPer: +(v.reduce((s, r) => s + r.topPer, 0) / v.length).toFixed(1),
    topX: +(v.reduce((s, r) => s + r.topX, 0) / v.length).toFixed(1) }; };
  const AX = agg(rowsX), AY = agg(rowsY);
  console.log(`ⓑ 16셀 주기 배수: 가로 ${AX.x16}× · 세로 ${AY.x16}×   (최강 주기 가로 ${AX.topPer}셀 ${AX.topX}× · 세로 ${AY.topPer}셀 ${AY.topX}×)`);

  // ⓒ 청크 경계 단차 — 경계를 넘는 이웃 차 vs 청크 안쪽 이웃 차
  let bSum = 0, bN = 0, iSum = 0, iN = 0;
  const CH = 16;
  const gx0 = site.i - Math.floor(W / 2);
  for (let b = 2; b < H - 2; b++) for (let a = 2; a < W - 3; a++) {
    const cx = gx0 + a, d = Math.abs(at(a + 1, b) - at(a, b));
    if (Math.floor(cx / CH) !== Math.floor((cx + 1) / CH)) { bSum += d; bN++; } else { iSum += d; iN++; }
  }
  const bAvg = bSum / Math.max(bN, 1), iAvg = iSum / Math.max(iN, 1);
  console.log(`ⓒ 이웃 높이차 평균: 청크 경계 ${bAvg.toFixed(3)}m (n=${bN}) · 청크 안 ${iAvg.toFixed(3)}m (n=${iN}) · 비 ${(bAvg / Math.max(iAvg, 1e-9)).toFixed(2)}배`);

  fs.writeFileSync(path.join(OUT, 'pad-probe.json'), JSON.stringify({ site, max: mx, AX, AY, bAvg, iAvg, grid: Array.from(g) }));
  console.log('\n저장:', path.join(OUT, 'pad-probe.json'));
  await br.close(); for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(0);
})().catch(e => { console.error(e); for (const p of procs) { try { p.kill(); } catch (_) {} } process.exit(1); });
