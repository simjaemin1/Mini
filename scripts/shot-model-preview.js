#!/usr/bin/env node
// =============================================================================
// scripts/shot-model-preview.js — 받은 모델 시트를 **실제 화면**에서 보는 한 장 [T1210 · ★재민 11-07]
//
// ★왜: 크기 · 빛 · 그림자 · 방향 · 판 수는 시트 그림만으론 못 정한다 — 같은 땅 · 같은 해 · 사람 옆에서 봐야 한다.
//   이 파일은 손잡이 `T1194_MODEL_SPRITES` 켬/끔 같은 자리를 찍는다. 짐승은 **클라 몹 표에만** 넣는다(가짜 · 서버 손 0 ·
//   랩 짐승이 아니라 늘 같은 자리 · 같은 방향이라 두 판을 겹쳐 견줄 수 있다). 둘레 여덟(방향 0 ~ 7 · 서기) · 사람 옆 하나(옆모습) ·
//   걷기(1.24 m/s) · 뛰기(7.0 m/s — 도주 속보) · 다친 몸(막대 · 이름 자리) · 주검(쓰러짐이 있는 종이면 누운 판 · 없으면 '×').
// 사용: KNOB=1 OUT=/tmp/x node scripts/shot-model-preview.js   → /tmp/x_full.png · _seq0..5.png(걷기 · 뛰기 판이 넘어가는 여섯 장) · _info.json
//   TYPE=deer(게임 칸 · 기본) · CX · CY(내 자리 셀 · 기본 = 농촌5 옆 풀밭 1388 · 2101) · HOUR(시계 오프셋 · 6 = 낮 12시 무렵) · KNOB=0 = 종전 그림
//   ★[T1237] WD=1 = 존을 `T1237_WATER_DEER=1` 로(welcome `waterDeer` — 고라니 시트는 T1194 와 따로 선다) · 몸짓 둘을 더 세운다(엎드림 `ps` 1 · 풀 뜯기 `ps` 2)
//   ★[T1242] WITH=<종> = 사람 오른쪽(옆모습 고라니의 맞은편 · 같은 땅선)에 다른 종 하나(예: deer — 지금 게임 사슴 그림)를 세워 크기를 견준다
//   ⚠e2e 처럼 central 3010 · zone 3020 을 띄운다 — 다른 e2e · 블렌더와 같이 돌리지 않는다.
// =============================================================================
'use strict';
const path = require('path'), fs = require('fs'), os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'), CPORT = 3010, ZPORT = 3020;
const CX = +(process.env.CX || 1388), CY = +(process.env.CY || 2101), HOUR = +(process.env.HOUR || 6);
const OUT = process.env.OUT || path.join(os.tmpdir(), 'model-preview'), KNOB = process.env.KNOB === '1', TYPE = process.env.TYPE || 'deer', WD = process.env.WD === '1', WITH = process.env.WITH || '';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-model-'));
const sleep = (m) => new Promise((r) => setTimeout(r, m)); const procs = [];
function boot(f, env) { const p = spawn('node', [f], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT }); procs.push(p); return p; }
async function waitHttp(u, n = 600) { for (let i = 0; i < n; i++) { try { const r = await fetch(u); if (r.ok) return true; } catch (e) {} await sleep(1000); } return false; }
const die = (c) => { for (const p of procs) { try { p.kill(); } catch (e) {} } process.exit(c); };
(async () => {
  const W = path.join(TMP, 'zw.js');
  fs.writeFileSync(W, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
cfg.WORLD.dayLengthMs=86400000; cfg.WORLD.worldEpoch=Date.now()-${HOUR}*3600000;
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);
  boot(path.join(ROOT, 'server', 'central.js'), { PORT: '' + CPORT, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2000);
  boot(W, { PORT: '' + ZPORT, ZONE_ID: 'hanbando', DB_PATH: path.join(TMP, 'shot.db'), CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ...(KNOB ? { T1194_MODEL_SPRITES: '1' } : {}), ...(WD ? { T1237_WATER_DEER: '1' } : {}),
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: CX * 32 + 16, y: CY * 32 + 16, name: '고정' } }) });
  await waitHttp(`http://localhost:${ZPORT}/health`); await sleep(2500);
  const { chromium } = require('playwright');
  const br = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await (await br.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 })).newPage();   // 1:1 — 화소를 그대로 오려 견준다
  const errs = [];
  pg.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  pg.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  await pg.goto(`http://localhost:${CPORT}/`); await sleep(2000);
  try { const b = await pg.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(20000);
  await pg.evaluate(() => { window.__terrain19.freezeT = 0.30; window.__terrain19.windOff = true; });   // shot-fixedcam 과 같은 고정(물결 · 바람)
  let last = '', same = 0, t = 0;
  while (t < 90000) { await sleep(2000); t += 2000;
    const d = await pg.evaluate(() => { const q = window.__mtDbg || {}; return [q.mt3chunks, q.segs].join(','); });
    if (d === last && !d.endsWith(',0')) { if (++same >= 3) break; } else { same = 0; last = d; } }
  const info = await pg.evaluate(([TYPE, WD, WITH]) => {
    const c = [...conns.values()].find((z) => z.role === 'primary') || [...conns.values()][0];
    const ox = c.meta.worldOffsetX, oy = c.meta.worldOffsetY || 0;
    const px = Math.round(myAbsPredicted.x - ox), py = Math.round(myAbsPredicted.y - oy);
    const del = c.mobs.delete.bind(c.mobs);
    c.mobs.delete = (k) => (String(k).startsWith('shot') ? false : del(k));   // 틱의 시야 정리가 가짜를 지우지 않게
    const now = performance.now();
    const put = (mid, dx, dy, o) => c.mobs.set(mid, Object.assign({ mid, x: px + dx, y: py + dy, z: 0, floor: 0, vx: 0, vy: 0, _fvx: 1, _fvy: 0, hp: 30, maxHp: 30,
      type: TYPE, buf: [], lastX: px + dx, lastY: py + dy, lastT: now }, o));
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    dirs.forEach(([fx, fy], d) => { const l = Math.hypot(fx, fy); put('shotr' + d, 150 + fx / l * 64, -150 + fy / l * 64, { _fvx: fx, _fvy: fy }); });
    put('shotside', -34, 34, { _fvx: 1, _fvy: -1 });
    put('shotwalk', 260, 40, { vx: 28, vy: -28, _fvx: 1, _fvy: -1 });
    put('shotrun', 330, -30, { vx: 158, vy: -158, _fvx: 1, _fvy: -1 });
    put('shothurt', 60, 150, { hp: 9, _fvx: -1, _fvy: 1 });
    if (WD) { put('shotlie', 295, -155, { ps: 1, _fvx: 1, _fvy: 1 }); put('shoteat', 395, -55, { ps: 2, _fvx: 1, _fvy: 0 }); }   // [T1237] 몸짓 — 엎드림 · 풀 뜯기(화면 오른쪽 — 내 자리 왼쪽 위는 땅이 늦게 선다)
    if (WITH) put('shotwith', 34, -34, { type: WITH, _fvx: 1, _fvy: -1 });   // [T1242] 사람 오른쪽 같은 땅선(화면 +68 px) — 옆모습

    c.corpses.set('shotc', { cid: 'shotc', mobType: TYPE, x: px + 200, y: py + 120, drops: {} });
    const cv = document.querySelector('canvas'), mi = w2i(myAbsPredicted.x, myAbsPredicted.y);
    const scr = (x, y) => { const p = w2i(ox + x, oy + y); return [Math.round(p.x - mi.x + cv.width / 2), Math.round(p.y - mi.y + cv.height / 2)]; };   // 렌더 루프 toScreen 과 같은 식(카메라 = 내 몸)
    const out = { px, py, me: scr(px, py), mobs: {} };
    for (const [mid, m] of c.mobs) if (String(mid).startsWith('shot')) out.mobs[mid] = scr(m.x, m.y);
    out.mobs.shotc = scr(px + 200, py + 120);
    return out;
  }, [TYPE, WD, WITH]);
  await sleep(3500);
  await pg.screenshot({ path: OUT + '_full.png' });
  const dbg = await pg.evaluate(() => (window.__mdlDbg ? JSON.parse(JSON.stringify(window.__mdlDbg)) : null));
  for (let i = 0; i < 6; i++) { await sleep(70); await pg.screenshot({ path: OUT + `_seq${i}.png` }); }
  fs.writeFileSync(OUT + '_info.json', JSON.stringify({ knob: KNOB, wd: WD, with: WITH, type: TYPE, info, dbg, errs, hour: HOUR, cx: CX, cy: CY }, null, 1));
  console.log('찍음', OUT + '_full.png', '· 오류', errs.length, errs.slice(0, 3).join(' | '));
  await br.close(); die(0);
})().catch((e) => { console.error(e); die(1); });
