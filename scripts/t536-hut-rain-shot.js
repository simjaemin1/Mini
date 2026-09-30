#!/usr/bin/env node
// === scripts/t536-hut-rain-shot.js — 움집 안에서 비 올 때의 화면 [T536 ⑤ · 2026-09-30] ======================
//
// ★묻는 것(카드 ⑤): 마을 움집 안에서 비가 올 때 — 화면에 비가 없고 · 빗소리가 없고 · 문 앞 1칸은 비가 온다.
//   실클라(헤드리스 크로미움)로 들어가 그 자리에 서서 **화면 그대로** 찍고, 층이 스스로 말하는 계기를 같이 적는다:
//     `__rainDbg()`(그린 빗줄기 수 · 실내) · `_sfxWx`(소리 층이 받은 강수·실내) · 켜진 빗소리 반복(`_sfxLoops` 의 `amb:rain*`)
//     · `__cutawayDbg`(그 움집의 지붕을 걷었나) · 게이지 `weather.indoor`(서버의 몸 실내).
// ★판정은 한 줄도 여기서 짓지 않는다 — 시계는 픽스처 정본(`fixture-clock.setClock` · `__e2e_clock`), 자리는 `teleport_debug`,
//   하늘은 정오에 멈춘다(`e2e-weather` 의 래퍼 문법 · 하루 24시간) · 바람 풀은 끈다(`__terrain19.windOff` — 화면을 고르게).
// ★제품 코드 0 · 러너 밖 · 도구. 실행: node scripts/t536-hut-rain-shot.js --outdir DIR [--tag on|off] [--env K=V]… [--cells IN,DOOR]
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const argv = process.argv;
const arg = (k, d) => { const i = argv.indexOf(k); return i > 0 ? argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const OUTDIR = arg('--outdir', '/tmp/t536-shot');
const TAG = arg('--tag', 'on');
const RAIN_DAY = +arg('--day', 160);
const SETTLE = +arg('--settle', 5500);   // 자리를 옮긴 뒤 지형 조각이 다 들어올 때까지 기다리는 몫(ms) — 덜 기다리면 안 들어온 땅이 검게 찍힌다
// ★존 포트는 `zone-config` 의 한반도 자리(3020)여야 한다 — 로비(`/zones`)가 그 표를 클라에 준다(다른 포트면 "접속 가능한 지역이 없습니다").
const CPORT = +arg('--cport', 3010), ZPORT = +arg('--zport', 3020);
const ZENV = {};
argv.forEach((a, i) => { if (a === '--env' && argv[i + 1]) { const [k, ...v] = argv[i + 1].split('='); ZENV[k] = v.join('='); } });
const CDB = `/tmp/t536s-central-${process.pid}.db`, ZDB = `/tmp/t536s-zone-${process.pid}.db`;
fs.mkdirSync(OUTDIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) {
  const p = spawn(process.execPath, [file], { cwd: ROOT, env: Object.assign({}, process.env, env), stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
// ★하늘을 정오에 멈춘다 — `e2e-weather` 의 래퍼 그대로(하루 24시간 · epoch 을 정오에). 몸·날씨의 날은 픽스처 시계가 쥔다.
function writeWrap() {
  const f = path.join(OUTDIR, `zone-wrap-t536-${process.pid}.js`);
  fs.writeFileSync(f, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
if(process.env.WRAP_DAY_MS){const d=parseInt(process.env.WRAP_DAY_MS,10);cfg.WORLD.dayLengthMs=d;cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);}
require(path.join(ROOT,'server','zone.js'));`);
  return f;
}

(async () => {
  const c = boot(path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot(writeWrap(), Object.assign({ PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_BANDITS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', WRAP_DAY_MS: '86400000' }, ZENV));
  const zu = FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 400000 });
  if (!(await cu).ok || !(await zu).ok) { console.log('기동 실패'); process.exit(1); }
  const { rows } = await FX.waitVillages(ZDB);
  if (!rows.length) { console.log('마을 0'); process.exit(1); }
  const V = rows.slice().sort((a, b) => a.id - b.id)[0];
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [], cons = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => { cons.push(m.text().slice(0, 160)); if (cons.length > 60) cons.shift(); });
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.fill('#name', 't536');
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  const inw = await FX.waitInWorld(page);
  if (!inw.ok) { await page.screenshot({ path: path.join(OUTDIR, `t536-${TAG}-fail.png`) });
    console.log('입장 실패'); console.log('pageerror', JSON.stringify(errs.slice(-5))); console.log('console', cons.slice(-25).join('\n')); process.exit(1); }
  await page.evaluate(() => { if (typeof sfxWake === 'function') sfxWake(); });
  const tp = async (x, y, ms) => { await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]); await sleep(ms || 3500); };
  await tp(V.cx * 32 + 16, V.cy * 32 + 16, Math.round(SETTLE * 1.2));
  const fx = await FX.setClock(page, { day: RAIN_DAY, night: false });
  // 움집 — 클라가 받은 건물에서 태그 렉트(쉼터 아님)를 고른다(마을 중심에서 가장 가까운 것)
  const huts = await page.evaluate(() => {
    const out = new Map();
    for (const c2 of conns.values()) for (const b of (c2.buildings ? c2.buildings.values() : [])) {
      if (b.type !== 'floor' || !b.data || !Array.isArray(b.data.hut) || b.data.shelter || (b.floor || 0) !== 0) continue;
      out.set(b.data.hut.join(','), b.data.hut.slice());
    }
    return [...out.values()];
  });
  const cellsArg = arg('--cells', null);
  let R = null;
  if (cellsArg) R = cellsArg.split(',').map(Number);
  else R = huts.sort((a, b) => Math.hypot((a[0] + a[2]) / 2 - V.cx, (a[1] + a[3]) / 2 - V.cy) - Math.hypot((b[0] + b[2]) / 2 - V.cx, (b[1] + b[3]) / 2 - V.cy))[0];
  if (!R) { console.log('움집 없음'); process.exit(1); }
  const IN = { cx: R[0] + 2, cy: R[1] + 1 }, DOOR = { cx: R[0] + 2, cy: R[3] + 1 };
  console.log(`마을 ${V.name}(${V.cx},${V.cy}) · 움집 [${R}] · 안 (${IN.cx},${IN.cy}) · 문 (${DOOR.cx},${DOOR.cy}) · 시계 ${fx.ok ? 'ok' : 'x'} · 손잡이 ${JSON.stringify(ZENV)}`);
  const read = () => page.evaluate((r) => {
    const cut = window.__cutawayDbg && (window.__cutawayDbg.rects || []).find((h) => h.r.join(',') === r.join(','));
    return { rain: window.__rainDbg ? window.__rainDbg() : null,
      sfx: (typeof _sfxWx !== 'undefined' && _sfxWx) ? Object.assign({}, _sfxWx) : null,
      rainLoops: (typeof _sfxLoops !== 'undefined') ? [..._sfxLoops.keys()].filter((k) => /^amb:rain/.test(k)) : null,
      windLoop: (typeof _sfxLoops !== 'undefined') ? _sfxLoops.has('amb:wind') : null,
      ctx: (typeof _sfxCtx !== 'undefined' && _sfxCtx) ? _sfxCtx.state : null,
      roofOn: cut ? cut.roofOn : null, srvIndoor: (typeof myWeather !== 'undefined' && myWeather) ? myWeather.indoor : undefined,
      precip: (typeof myWeather !== 'undefined' && myWeather) ? myWeather.precip : null, tempC: (typeof myWeather !== 'undefined' && myWeather) ? myWeather.tempC : null,
      room: window.__roomDbg ? window.__roomDbg().indoors : null };
  }, R);
  const calm = () => page.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
  const out = { tag: TAG, env: ZENV, village: V, hut: R, IN, DOOR, day: RAIN_DAY, shots: {} };
  for (const [k, cell] of [['in', IN], ['door', DOOR]]) {
    await tp(cell.cx * 32 + 16, cell.cy * 32 + 16, SETTLE - 1500);
    await calm(); await sleep(1500);
    const r = await read();
    const f = path.join(OUTDIR, `t536-${TAG}-${k}.png`);
    await page.screenshot({ path: f });
    out.shots[k] = Object.assign({ file: f, cell }, r);
    console.log(`${TAG} ${k}: 서버 실내 ${r.srvIndoor} · 클라 방 ${r.room} · 빗줄기 ${r.rain && r.rain.n}(on ${r.rain && r.rain.on} · 층 실내 ${r.rain && r.rain.indoor}) · 소리 층 실내 ${r.sfx && r.sfx.indoor} · 빗소리 반복 ${JSON.stringify(r.rainLoops)} · 바람 소리 ${r.windLoop} · 지붕 ${r.roofOn === false ? '걷힘' : r.roofOn} · 강수 ${r.precip} · ${r.tempC}℃ · 소리 ${r.ctx}`);
  }
  out.pageErrors = errs;
  fs.writeFileSync(path.join(OUTDIR, `t536-${TAG}.json`), JSON.stringify(out, null, 1));
  await browser.close();
  for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} }
  for (const f of [CDB, ZDB, CDB + '-wal', ZDB + '-wal', CDB + '-shm', ZDB + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  console.log(`끝 · pageerror ${errs.length}`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
