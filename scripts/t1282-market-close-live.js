#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1282 실클라 판 · 판 하나 ≈ 6 ~ 7분 · 둘(지금 · 고치기 전) ≈ 14분 · 포트 3010/3020 — E2E 동시 실행 금지)
// === scripts/t1282-market-close-live.js — 장마당 그림이 마감 틱 앞뒤로 진 장을 다시 그리나 (T1282 · T1273 회부 3 · 2026-11-12) ==========
//
// ★왜 [T1273 회부 3] 켬(`T1253_CLOCK_FIX` 기본)이면 `_t1253Now()` 가 마감 조각 중 `world.day × 하루` 를 줬다 — econ 머리(`world.day += 1`)가 돌기 전
//   마감 틱에는 옛 날 머리라 그날 이미 진 장이 `marketVillages` 에 다시 들고, 존은 틱마다 `_mktBroadcast` 를 드레인보다 먼저 부르니 클라에 `markets` 방송이 더 간다.
//   T1282 가 마감 중 시계를 "닫는 날의 끝"으로 고쳤다. 이 판은 그것을 **실클라**(Chromium · 존 · central 그대로)에서 본다.
//
// ★판 둘(같은 env · 같은 시드 세계):
//   now    — 지금 가지(고친 판)
//   before — 같은 가지인데 존 아이가 `server/villages.js` 를 실을 때만 마감 중 시계 한 줄을 종전 글자(`return D * M;`)로 바꾼다
//            (이 파일을 `node -r` 로 미리 실어 `Module._extensions` 를 감싼다 · 파일 무변 · 하네스 미끼 K1 과 같은 글자)
//   env: ENABLE_VILLAGES=1 · VILLAGE_DAY_MS=20000(하루 20초 · 장 = 하루 4/24 ≈ 3.3초) · 그 밖 기본(T731 창 · T1182 몸 · T707 장 켬).
//
// ★자(클라 쪽 · 서버 무계측):
//   ① 소켓 감싸기(addInitScript) — 받은 `markets`(장마당 집합 전체 치환) · `sim_village_day`(마감 방송 조각 = econ 머리 뒤)를 시각과 함께 적는다.
//   ② 그림 상태 — 렌더 루프가 좌판을 깔 때 읽는 `c.markets`(`__getMarkets()`)를 25ms 마다 표본(바뀐 것만).
//   마을마다 켜짐 구간을 세운다. **진 장 다시 그림** = 켜짐 구간이 장 길이의 0.4배(1.33초)보다 짧고 그 마을이 그날 이미 한 번 켜졌다 꺼진 구간 —
//   진짜 장은 econ 날 4/24(3.3초) 동안 선다(econ 이 밀리면 더 길다 · 짧아지지 않는다). 그 구간이 마감 방송(`sim_village_day`) 앞 3초 안에 섰는지도 적는다.
//
// 쓰는 법: node scripts/t1282-market-close-live.js [--arm now|before|both] [--obs 240] [--out 계측/T1282_2026-11-12/실클라.json]
if (process.env.T1282_BAIT === 'K1' && require.main !== module) {   // ── 미리 실림(존 아이) — 마감 중 시계 한 줄만 종전 글자로
  const path = require('path'), fs = require('fs'), Module = require('module');
  const VFILE = path.join(__dirname, '..', 'server', 'villages.js');
  const FROM = 'if (state.tickJobs || state._t731 || state._t1253Edge) return (state._t1282D === D ? D + 1 : D) * M;', TO = 'if (state.tickJobs || state._t731 || state._t1253Edge) return D * M;';
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, f) {
    if (f !== VFILE) return old(m, f);
    const src = fs.readFileSync(f, 'utf8'), n = src.split(FROM).length - 1;
    if (n !== 1) { console.error(`[T1282 미끼] 자리 ${n}곳 — 멈춤`); process.exit(3); }
    console.log('[T1282 미끼] K1 — 마감 중 econ 날 시계를 종전 글자(`return D * M;`)로 실었다');
    m._compile(src.replace(FROM, TO), f);
  };
  return;
}
const path = require('path'), fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2), opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const ARMS = opt('--arm', 'both') === 'both' ? ['now', 'before'] : [opt('--arm')];
const OBS = +opt('--obs', 240) * 1000, OUT = opt('--out', null);
const CPORT = 3010, ZPORT = 3020, DAY = 20000, FLICK = 0.4 * DAY * 4 / 24;
const TMP = fs.mkdtempSync(path.join(require('os').tmpdir(), 't1282-live-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(tag, args, env) {
  const p = spawn(process.execPath, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p._name = tag; p._out = '';
  const keep = (d) => { p._out += d.toString(); if (p._out.length > 600000) p._out = p._out.slice(-300000); };
  p.stdout.on('data', keep); p.stderr.on('data', keep);
  procs.push(p); return p;
}
async function killAll() {
  for (const p of procs) { try { fs.writeFileSync(path.join(TMP, `${p._name}.log`), p._out); } catch (e) {} try { p.kill('SIGKILL'); } catch (e) {} }
  procs.length = 0; await sleep(3000);
}
const REC = () => {   // 페이지 안 — 소켓 감싸기 + 그림 상태 표본
  const O = window.WebSocket; window.__t1282 = []; window.__t1282s = [];
  window.WebSocket = class extends O { constructor(...a) { super(...a); this.addEventListener('message', (ev) => {
    if (typeof ev.data !== 'string' || (ev.data.indexOf('"markets"') < 0 && ev.data.indexOf('sim_village_day') < 0)) return;
    try { const m = JSON.parse(ev.data); if (m.type === 'markets') window.__t1282.push([performance.now(), 'm', (m.m || []).join(',')]); else if (m.type === 'sim_village_day') window.__t1282.push([performance.now(), 'd', m.day]); } catch (e) {}
  }); } };
  let last = null;
  setInterval(() => { const g = window.__getMarkets ? window.__getMarkets() : null; const v = g ? JSON.stringify(g.hanbando || null) : 'null'; if (v !== last) { last = v; window.__t1282s.push([performance.now(), v]); } }, 25);
};
function analyse(ev, scr) {
  const days = ev.filter((e) => e[1] === 'd'), ms = ev.filter((e) => e[1] === 'm');
  const on = new Map(), iv = [];   // 마을 → 켜진 시각 · 구간 [마을, 켬, 끔]
  for (const [t, , s] of ms) {
    const set = new Set(); const a = s ? s.split(',') : []; for (let i = 0; i + 1 < a.length; i += 2) set.add(a[i] + ',' + a[i + 1]);
    for (const k of set) if (!on.has(k)) on.set(k, t);
    for (const [k, t0] of [...on]) if (!set.has(k)) { iv.push([k, t0, t]); on.delete(k); }
  }
  const tEnd = ms.length ? ms[ms.length - 1][0] : 0;
  const dayBefore = (t) => days.find((d) => d[0] >= t && d[0] - t <= 3000);
  const flick = [], seen = new Map();
  for (const [k, t0, t1] of iv.sort((x, y) => x[1] - y[1])) {
    const prev = seen.get(k); seen.set(k, t1);
    if (t1 - t0 < FLICK && prev != null) flick.push({ k, on: +(t0 / 1000).toFixed(2), ms: Math.round(t1 - t0), sincePrevOff: Math.round(t0 - prev), dayMsgIn: (() => { const d = dayBefore(t0); return d ? Math.round(d[0] - t0) : null; })(), day: (() => { const d = dayBefore(t0); return d ? d[2] : null; })() });
  }
  //   그림 상태 — 마감 방송마다 그 앞 3초 · 그 순간 · 뒤 0.5초의 `c.markets`
  const at = (t) => { let v = 'null'; for (const [ts, s] of scr) { if (ts > t) break; v = s; } return v; };
  const around = days.slice(0, 12).map((d) => ({ day: d[2], before3s: at(d[0] - 3000), atMsg: at(d[0]), after05s: at(d[0] + 500) }));
  //   다시 켜짐 — 꺼진 뒤 150ms(≈ 존 틱 넷) 안에 같은 마을이 다시 켜진 구간(길이 무관 · 진짜 새 장은 econ 날이 바뀌어야 선다 — 마감 하나가 몇 초 걸린다)
  const reopen = []; { const lastOff = new Map(); for (const [k, t0, t1] of iv.slice().sort((x, y) => x[1] - y[1])) { const p = lastOff.get(k); if (p != null && t0 - p <= 150) reopen.push({ k, on: +(t0 / 1000).toFixed(2), ms: Math.round(t1 - t0), gap: Math.round(t0 - p) }); lastOff.set(k, t1); } }
  return { dayMsgs: days.length, marketMsgs: ms.length, intervals: iv.length, real: iv.filter((x) => x[2] - x[1] >= FLICK).length, flicker: flick.length, flickerNearClose: flick.filter((f) => f.dayMsgIn != null).length, flick: flick.slice(0, 20),
    reopen: reopen.length, reopenList: reopen.slice(0, 20), around, spanS: Math.round(tEnd / 1000),
    raw: { m: ms.map((e) => [Math.round(e[0]), e[2]]), d: days.map((e) => [Math.round(e[0]), e[2]]), iv: iv.map((x) => [x[0], Math.round(x[1]), Math.round(x[2])]) } };
}
async function arm(tag) {
  console.log(`\n=== 판 ${tag} ===`);
  FB.mustBeFree([CPORT, ZPORT], 't1282-market-close-live');
  const dbc = path.join(TMP, `c-${tag}.db`), dbz = path.join(TMP, `z-${tag}.db`);
  const central = boot(`central-${tag}`, [path.join(ROOT, 'server', 'central.js')], { PORT: String(CPORT), DB_PATH: dbc, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const upC = FB.waitUp(central, /central server up on/, { name: 'central' });
  const zargs = tag === 'before' ? ['-r', __filename, path.join(ROOT, 'server', 'zone.js')] : [path.join(ROOT, 'server', 'zone.js')];
  const zone = boot(`zone-${tag}`, zargs, { PORT: String(ZPORT), ZONE_ID: 'hanbando', CENTRAL_URL: `http://localhost:${CPORT}`, DB_PATH: dbz, ENABLE_VILLAGES: '1', VILLAGE_DAY_MS: String(DAY),
    ...(tag === 'before' ? { T1282_BAIT: 'K1' } : {}) });
  const upZ = FB.waitUp(zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  const uc = await upC, uz = await upZ;
  console.log(`  central ${uc.ok ? uc.ms + 'ms' : uc.why} · zone ${uz.ok ? uz.ms + 'ms' : uz.why}`);
  if (!uc.ok || !uz.ok) { await killAll(); return { err: 'boot' }; }
  const baitLine = /\[T1282 미끼\] K1/.test(zone._out);
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.addInitScript(REC);
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  const enter = await page.$('#enter'); if (enter) await enter.click();
  let inWorld = false;
  for (let i = 0; i < 120 && !inWorld; i++) { inWorld = await page.evaluate(() => !!(window.__getSrvAbs && window.__getSrvAbs())); if (!inWorld) await sleep(500); }
  console.log(`  월드 입장 ${inWorld}`);
  const t0 = Date.now();
  let firstMkt = null;
  while (Date.now() - t0 < OBS + 240000) {   // 첫 장이 선 뒤 OBS 만큼 본다(첫 장까지 상한 4분)
    await sleep(5000);
    const n = await page.evaluate(() => window.__t1282.filter((e) => e[1] === 'm' && e[2]).length);
    if (n && firstMkt == null) { firstMkt = Date.now(); console.log(`  첫 장 방송 ${((firstMkt - t0) / 1000) | 0}초`); }
    if (firstMkt != null && Date.now() - firstMkt >= OBS) break;
    if (firstMkt == null && Date.now() - t0 > 240000) break;
  }
  const ev = await page.evaluate(() => window.__t1282.slice()), scr = await page.evaluate(() => window.__t1282s.slice());
  try { await page.screenshot({ path: path.join(TMP, `${tag}.png`) }); } catch (e) {}
  await browser.close();
  const R = analyse(ev, scr);
  const dayLines = (zone._out.match(/마을 econ day \d+:[^\n]*마감 \d+ms/g) || []).map((l) => [+(l.match(/econ day (\d+)/)[1]), +(l.match(/마감 (\d+)ms/)[1])]);
  await killAll();
  Object.assign(R, { tag, inWorld, baitLine, pageErrors: errs.length, observedS: firstMkt ? Math.round((Date.now() - firstMkt) / 1000) : 0, closeMs: dayLines });
  console.log(`  마감 방송 ${R.dayMsgs} · 장 방송 ${R.marketMsgs} · 켜짐 구간 ${R.intervals}(진짜 장 ${R.real}) · ★진 장 다시 그림 ${R.flicker}(마감 방송 앞 3초 안 ${R.flickerNearClose}) · 꺼진 뒤 150ms 안 다시 켜짐 ${R.reopen} · 미끼 줄 ${baitLine} · 페이지 오류 ${errs.length}`);
  for (const f of R.flick.slice(0, 6)) console.log(`    ${f.k} 켬 ${f.on}s · ${f.ms}ms · 앞 꺼짐 뒤 ${f.sincePrevOff}ms · 마감 방송 ${f.dayMsgIn == null ? '—' : f.dayMsgIn + 'ms 뒤(day ' + f.day + ')'}`);
  return R;
}
(async () => {
  FB.reapOnExit(procs);
  const out = {};
  for (const t of ARMS) out[t] = await arm(t);
  if (OUT) { fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true }); fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(out, null, 1)); }
  console.log(`\nT1282-LIVE ${ARMS.map((t) => `${t} 진 장 다시 그림 ${out[t].flicker}(마감 앞 ${out[t].flickerNearClose}) · 다시 켜짐 ${out[t].reopen} · 진짜 장 ${out[t].real}`).join(' · ')} · 로그 ${TMP}`);
  process.exit(0);
})().catch(async (e) => { console.error(e); await killAll(); process.exit(1); });
