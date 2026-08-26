#!/usr/bin/env node
// =============================================================================
// 그림 — v3(화면 평행 평면 s+32h) vs v4(수직 평면 s) 짝.
//
// ★이 그림이 보여야 하는 것: **내 뒤에 있는 봉우리**.
//   v3 은 깊이 s+32h 로 갈랐다 — 뒤에 있어도(s 가 작아도) **키가 크면** 문턱을 넘어
//   흐려졌다. v4 는 지면 깊이 s 로만 가른다 — 뒤 산은 키와 무관하게 **불투명**이다.
//   그래서 짝 사진에서 갈리는 자리는 "화면상 위쪽에 있는 먼 봉우리"다.
//
// ★자리는 **고르지 않고 잰다**. 옛 판(0827a)이 경계가 화면 밖인 구도를 내보내서
//   "왜 경계선이 대각선이야?" 를 들었다 — 그건 산 제 모서리였다.
//   ⇒ 여기서는 걸음마다 v3/v4 를 둘 다 찍어 **다른 화소 수**를 재고, 가장 큰 자리를 쓴다.
//
// 산출 (OUTDIR, 기본 /tmp/cutline)
//   v3.png · v4.png      — 실제 화면 두 장
//   sheet.png            — 2열(왼 v3 · 오 v4) × 2행(위 전체 · 아래 확대)
//   여기서 자홍/색칠은 **쓰지 않는다**. 전부 실제 화면 화소다.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const OUT = process.env.OUTDIR || '/tmp/cutline'; fs.mkdirSync(OUT, { recursive: true });
const SITE = { cx: +(process.env.CX || 2150), cy: +(process.env.CY || 1959) };
const TRIES = +(process.env.TRIES || 9);
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) { } await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) { } } process.exit(c); };

(async () => {
  fs.writeFileSync('/tmp/zw-cl.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-21600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot('/tmp/zw-cl.js', { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: '/tmp/cl.db', CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0',
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: SITE.cx * 32 + 16, y: SITE.cy * 32 + 16, name: '경계' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  pg.on('pageerror', (e) => console.log('[err]', String(e.message).slice(0, 140)));
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  for (const s2 of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
    try { const b = await pg.$(s2); if (b) { await b.click(); break; } } catch (e) { } }
  await sleep(20000);
  // 시계 정오 앵커 · 바람 끔 — 프레임 사이에 산 말고 다른 게 움직이면 짝 비교가 흐려진다
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true; });
  await sleep(1500);
  // ★굽기 잔량이 그대로일 때까지 — 프레임당 1장이라 안 기다리면 반쯤 구운 그림을 찍는다
  const settle = async (max = 120000) => { let last = '', same = 0, t = 0;
    while (t < max) { await sleep(1500); t += 1500;
      const d = await pg.evaluate(() => { const q = window.__mtDbg; return [q.mt3chunks, q.segs, q.mt3bakeN].join(','); });
      if (d === last) { if (++same >= 3) return t; } else { same = 0; last = d; } }
    return t; };
  await settle();
  await pg.evaluate(() => { window.__mtFadeCut(1); window.__mtFadeClip(0); });

  const shot = async (tag) => { const p2 = path.join(OUT, tag + '.png'); await pg.screenshot({ path: p2 });
    return PNG.sync.read(fs.readFileSync(p2)); };
  // v3/v4 한 짝을 찍고 **다른 화소**를 센다. 흐림층은 HUD 밖(위 260px 제외)만 본다.
  // ★HUD 는 뺀다 — 왼쪽 도구띠·위 상태줄·오른쪽 위 미니맵. 차이 무게중심이 HUD 로 끌려가면
  //   확대 칸이 게임 화면이 아니라 UI 를 비춘다(옛 판이 그랬다).
  const BOX = [46, 140, 1180, 880];
  const pairAt = async () => {
    await pg.evaluate(() => window.__mtFadePlane(1)); await sleep(900); await settle(20000);
    const fa = await pg.evaluate(() => ({ faded: window.__mtOccDbg.faded, split: window.__mtCutN().split }));
    const a = await shot('_v3');
    await pg.evaluate(() => window.__mtFadePlane(0)); await sleep(900); await settle(20000);
    const fb = await pg.evaluate(() => ({ faded: window.__mtOccDbg.faded, split: window.__mtCutN().split }));
    const b = await shot('_v4');
    let cnt = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0;
    for (let y = BOX[1]; y < BOX[3]; y++) for (let x = BOX[0]; x < BOX[2]; x++) {
      const i = (y * a.width + x) * 4;
      if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]) > 12) {
        cnt++; sx += x; sy += y; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } }
    return { a, b, fa, fb, cnt, box: cnt ? [x0, y0, x1, y1] : null, mid: cnt ? [Math.round(sx / cnt), Math.round(sy / cnt)] : null };
  };
  // 상태 — 흐린 띠 수와 걸친 띠 수를 두 판 모두에서
  const state = async () => pg.evaluate(() => {
    const out = {};
    for (const p of [1, 0]) { window.__mtFadePlane(p); out[p ? 'v3' : 'v4'] = { faded: null }; }
    window.__mtFadePlane(0);
    return { occ: window.__mtOccDbg.n, split: window.__mtCutN().split, fz: window.__mtOccDbg.fz };
  });

  // ── 자리 찾기: 가림이 생길 때까지 걷고, 걸음마다 v3↔v4 차이를 잰다
  let best = null;
  for (let t = 0; t < TRIES; t++) {
    const st = await pg.evaluate(() => ({ n: window.__mtOccDbg.n, split: window.__mtCutN().split }));
    if (st.n > 0 && st.split > 0) {
      const P = await pairAt();
      console.log(`  ${t}걸음 — 가림 ${st.n} · 흐린 띠 v3 ${P.fa.faded} / v4 ${P.fb.faded} · 걸친 띠 v3 ${P.fa.split} / v4 ${P.fb.split} · 다른 화소 ${P.cnt}` +
                  (P.box ? ` · 상자 ${P.box[0]},${P.box[1]} ~ ${P.box[2]},${P.box[3]}` : ''));
      if (!best || P.cnt > best.cnt) { best = P; best.step = t; best.occ = st.n; best.split = st.split;
        fs.writeFileSync(path.join(OUT, 'v3.png'), PNG.sync.write(P.a));
        fs.writeFileSync(path.join(OUT, 'v4.png'), PNG.sync.write(P.b)); }
    } else console.log(`  ${t}걸음 — 가림 ${st.n} · 걸친 띠 ${st.split} (아직 가림 없음)`);
    // 가장 가까운 가림 자리로 한 걸음
    const aim = await pg.evaluate(() => {
      const me = window.__getMyAbs(); let b2 = null;
      for (let dx = -18; dx <= 18; dx += 2) for (let dy = -18; dy <= 18; dy += 2) {
        const r = window.__mtOccAt(me.x + dx * 32, me.y + dy * 32);
        if (!r || !r.n) continue;
        const d = Math.hypot(dx, dy); if (!b2 || d < b2.d) b2 = { dx, dy, d };
      } return b2; });
    const keys = [];
    if (aim) { if (aim.dy < -1) keys.push('w'); if (aim.dy > 1) keys.push('s');
               if (aim.dx < -1) keys.push('a'); if (aim.dx > 1) keys.push('d'); }
    if (!keys.length) keys.push('wasd'[t % 4]);
    for (const k of keys) { await pg.keyboard.down(k); await sleep(520); await pg.keyboard.up(k); }
    await sleep(500); await settle(20000);
  }
  if (!best) { console.log('★가림이 있는 자리를 못 찾았다 — CX/CY 를 바꿔서 다시.'); await br.close(); die(2); }

  const S = await state();
  console.log(`\n고른 자리 — ${best.step}걸음 · 가림 ${best.occ}장 · 걸친 띠 ${best.split} · 문턱 ${S.fz}`);
  console.log(`v3↔v4 다른 화소 ${best.cnt} · 상자 ${best.box.join(',')} · 무게중심 ${best.mid.join(',')}`);
  console.log(`흐린 띠 — v3 ${best.fa.faded}장 · v4 ${best.fb.faded}장 → v3 이 더 흐린 띠 ${best.fa.faded - best.fb.faded}장(내 뒤에 있어 나를 못 가리는 산)`);
  console.log(`걸친 띠 — v3 ${best.fa.split}장 · v4 ${best.fb.split}장 (v4 는 띠 안 s 퍼짐이 작아 더 적어야 정상)`);

  // ── 시트: 2열(왼 v3 · 오 v4) × 2행(위 전체 반배율 · 아래 확대 1:1)
  const CW = 700, CH = 450, ZW = 700, ZH = 450;
  const sheet = new PNG({ width: CW * 2, height: CH + ZH });
  const half = (src, dx, dy) => { for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
      const s2 = ((y * 2) * src.width + x * 2) * 4, t = ((dy + y) * CW * 2 + dx + x) * 4;
      sheet.data[t] = src.data[s2]; sheet.data[t+1] = src.data[s2+1]; sheet.data[t+2] = src.data[s2+2]; sheet.data[t+3] = 255; } };
  // 확대는 차이 무게중심을 가운데 두고 1:1 로 잘라 낸다
  // 확대는 **화면 한가운데(플레이어)** 를 중심으로 — 경계는 늘 내 발치에 선다.
  //   위 상태줄(y<150)은 안 물리게 아래로 민다.
  const zx = Math.max(0, Math.min(1400 - ZW, 700 - ZW / 2));
  const zy = Math.max(150, Math.min(900 - ZH, 450 - ZH / 2));
  const crop = (src, dx, dy) => { for (let y = 0; y < ZH; y++) for (let x = 0; x < ZW; x++) {
      const s2 = ((zy + y) * src.width + zx + x) * 4, t = ((dy + y) * CW * 2 + dx + x) * 4;
      sheet.data[t] = src.data[s2]; sheet.data[t+1] = src.data[s2+1]; sheet.data[t+2] = src.data[s2+2]; sheet.data[t+3] = 255; } };
  half(best.a, 0, 0); half(best.b, CW, 0);
  crop(best.a, 0, CH); crop(best.b, CW, CH);
  // 가운데 세로 경계선(1px 흰 줄) — 두 판이 어디서 갈리는지만 표시. 색칠은 아니다.
  for (let y = 0; y < CH + ZH; y++) { const t = (y * CW * 2 + CW) * 4;
    sheet.data[t] = 255; sheet.data[t+1] = 255; sheet.data[t+2] = 255; sheet.data[t+3] = 255; }
  for (let x = 0; x < CW * 2; x++) { const t = (CH * CW * 2 + x) * 4;
    sheet.data[t] = 255; sheet.data[t+1] = 255; sheet.data[t+2] = 255; sheet.data[t+3] = 255; }
  fs.writeFileSync(path.join(OUT, 'sheet.png'), PNG.sync.write(sheet));
  console.log(`시트 — ${path.join(OUT, 'sheet.png')}`);
  console.log(`  왼 = v3(화면 평행 평면 s+32h) · 오 = v4(수직 평면 s, 채택)`);
  console.log(`  위 = 전체 화면 반배율 · 아래 = 1:1 확대(${zx},${zy} 에서 ${ZW}×${ZH})`);
  await pg.evaluate(() => window.__mtFadePlane(0));
  await br.close(); die(0);
})().catch((e) => { console.error(e); die(1); });
