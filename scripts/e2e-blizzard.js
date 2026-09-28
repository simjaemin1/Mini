#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly A   ← 야간 세 밤 분할(T238) · `run-regress.sh --list "nightly A"`
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`getImageData` · `page.screenshot` → `PNG.sync.read`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`)을 만지는 카드는 이 표를 전수로 돌려라.
// =============================================================================
// e2e-blizzard — 눈보라: 바람 세기가 눈의 기울기·밀도를 미는가 · 성능 짝 [T500 ① 2026-09-28]
//   카드 ① "`37-r1-weather` 눈 스트로크 밀도·기울기를 `wind` 세기로(있는 `WX_TILT_K` 문법 · 새 문턱 0 — 세기 비례)"
//   카드 ④ "성능 짝(T93 규약 · SwiftShader 프레임)"
//
// ★두 층에서 잰다(e2e-weather T93 문법 그대로):
//   ⓑ~ⓓ **격리 캔버스** — `drawWeather(ctx,W,H,t)` 에 빈 캔버스를 주면 세계 없이 이 층만 결정적으로 그려진다.
//        켬/끔은 **그 한 칸**(`myWeather.frost` 가 있는가)으로 가른다 — 같은 판 같은 시각에서 칸을 잠시 빼면 끔 길이다
//        (클라가 손잡이를 아는 길이 정확히 그것 하나다 · 서버 손잡이 끔 판은 `e2e-frost` 가 따로 띄워 잰다).
//   ⓔ **진짜 화면** — 층이 프레임에 실제로 꽂혀 있는지(격리 캔버스는 절대 답 못 한다).
//   ⓕⓖ **성능** — 자는 이 레포가 같은 자리에 이미 그리는 **밤 오버레이**다(족보 74 · T93 ⓔⓕ).
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같은 판에서 잰다(끔 판 · 돌연변이 · 비).
//
// 사용: node scripts/e2e-blizzard.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');     // ★T349 기동 기다리기 정본(사본 0)
const FX = require('./fixture-clock');    // ★T140 입장 기다리기 정본(사본 0)
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-blizzard-${process.pid}.db`;
const SHOTS = process.env.SHOTS || '/tmp/e2e-blizzard-shots';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, extra) => { if (c) { pass++; say(`  ✓ ${m}` + (extra !== undefined ? `  ${extra}` : '')); }
                              else { fail++; say(`  ✗ ${m}` + (extra !== undefined ? `  ${extra}` : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 120)); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, `/tmp/e2e-blizzard-c-${process.pid}.db`]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
// ★하루를 **정오에 멈춘다**(e2e-weather 래퍼와 같은 문법) — 밤 오버레이가 켜졌다 꺼졌다 하면 짝 비교의 잡음 바닥이 흔들린다
const WRAP = `/tmp/zone-wrap-blizzard-${process.pid}.js`;
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
require(path.join(ROOT,'server','zone.js'));`);
// ★게임 화면 상자 — HUD 제외(e2e-weather·e2e-nature 와 같은 값 · 위 띠는 시계·숫자가 늘 바뀐다)
const GBOX = [40, 200, 1360, 880];
const diffPx = (a, b) => { let c = 0;
  for (let y = GBOX[1]; y < Math.min(a.height, b.height, GBOX[3]); y++)
    for (let x = GBOX[0]; x < Math.min(a.width, b.width, GBOX[2]); x++) {
      const i = (y * a.width + x) * 4;
      const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      if (d > 24) c++;
    }
  return c; };

(async () => {
  say('=== 눈보라 — 바람 세기가 눈의 기울기·밀도를 미는가 (T500 ①) ===');
  const _central = boot('central', path.join(ROOT, 'server', 'central.js'),
    { PORT: String(CPORT), DB_PATH: `/tmp/e2e-blizzard-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _up = await FB.waitUp(_central, /central server up on/, { name: 'central' });
  ok(_up.ok, 'central 기동', _up.ok ? `${_up.ms}ms` : _up.why);
  const _zone = boot('zone', WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T500_WINTER_FX: '1' });
  const _zu = await FB.waitUp(_zone, /zone server up on/, { name: 'zone', capMs: 300000 });
  ok(_zu.ok, 'zone 기동(T500_WINTER_FX=1)');
  if (!_up.ok || !_zu.ok) { shutdown(); process.exit(1); }

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
  const inw = await FX.waitInWorld(page);
  ok(inw.ok, '입장');
  // ★바람(풀 카펫)을 끄고 하늘을 맑게 시작한다(T98 §4-c) — 눈보라는 **이 하네스가 세운 판에서만** 켠다
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  await page.waitForFunction(() => typeof window.__rainForce === 'function' && !!window.__wx && !!window.__wx(), { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => window.__rainForce({ precip: 0 }));
  await sleep(1500);
  const rain = (o) => page.evaluate((f) => window.__rainForce(f), o);
  const shot = async (n) => { const f = `${SHOTS}/${n}.png`; await page.screenshot({ path: f }); return PNG.sync.read(fs.readFileSync(f)); };

  // ══ ⓐ 계기 — 켬을 **그 한 칸**으로 안다 ══════════════════════════════════════════
  say('\n[ⓐ 계기 — 서버 손잡이 켬이 스냅 칸 하나로 왔다]');
  const wired = await page.evaluate(() => ({ on: wxWinterOn(), frost: window.__wx().frost, dbg: Object.keys(window.__rainDbg()) }));
  ok(wired.on === true && wired.frost !== undefined, '★클라가 켬을 안다 — 스냅에 `frost` 칸이 있다', JSON.stringify(wired));

  // ══ ⓑ~ⓓ 격리 캔버스 ═══════════════════════════════════════════════════════════
  say('\n[ⓑ~ⓓ 격리 캔버스 — 같은 판 같은 시각, 켬/끔은 칸 하나로 가른다]');
  const iso = await page.evaluate(() => {
    const CW = 256, CH = 256, CELLS = CW * CH / 1024;           // 64셀 — 획 수를 정확히 지정할 수 있다
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const knob = (on, fn) => {                                   // 켬/끔 = `frost` 칸이 있는가(클라가 아는 유일한 길)
      const had = ('frost' in myWeather), v = myWeather.frost;
      if (!on) delete myWeather.frost; else if (!had) myWeather.frost = 0;
      try { return fn(); } finally { if (had) myWeather.frost = v; else delete myWeather.frost; }
    };
    const draw = (o, t) => { window.__rainForce(o); c2.clearRect(0, 0, CW, CH); const n = drawWeather(c2, CW, CH, t);
      return { n, px: c2.getImageData(0, 0, CW, CH).data, dbg: window.__rainDbg() }; };
    const same = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false; return true; };
    const ink = (d) => { let k = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) k++; return k; };
    const out = { CELLS };
    // ⓑ 무풍 눈 = 종전 눈(켬/끔 화소 동일) · 비는 바람이 있어도 켬/끔 동일(눈보라는 눈에만)
    const S0on = knob(true, () => draw({ precip: 1, tempC: -5, wind: 0 }, 1234));
    const S0off = knob(false, () => draw({ precip: 1, tempC: -5, wind: 0 }, 1234));
    out.nil = { nOn: S0on.n, nOff: S0off.n, same: same(S0on.px, S0off.px), ink: ink(S0on.px), bz: S0on.dbg.blizzard };
    const Ron = knob(true, () => draw({ precip: 1, tempC: 5, wind: 0.5 }, 1234));
    const Roff = knob(false, () => draw({ precip: 1, tempC: 5, wind: 0.5 }, 1234));
    out.rain = { same: same(Ron.px, Roff.px), n: Ron.n, bz: Ron.dbg.blizzard };
    const Wn = knob(true, () => draw({ precip: 1, tempC: -5, wind: 0.3 }, 1234));
    const Wf = knob(false, () => draw({ precip: 1, tempC: -5, wind: 0.3 }, 1234));
    out.windy = { same: same(Wn.px, Wf.px), inkOn: ink(Wn.px), inkOff: ink(Wf.px), nOn: Wn.n, nOff: Wf.n };
    // ⓒ 밀도 — 획 수 = 넓이 × precip × (1 + |공기 자|) (켬) · 넓이 × precip (끔) · 바람 부호 무관
    out.dens = [];
    for (const w of [0, 0.1, 0.3, -0.3, 0.6, 1]) {
      const a = knob(true, () => draw({ precip: 0.5, tempC: -5, wind: w }, 777));
      const b = knob(false, () => draw({ precip: 0.5, tempC: -5, wind: w }, 777));
      out.dens.push({ w, on: a.n, off: b.n, tilt: a.dbg.tilt, tiltOff: b.dbg.tilt });
    }
    // ⓓ 기울기 — 획 **하나**의 움직임(시각 t → t+50ms 중심 이동)으로 잰다: 가로 이동 ÷ 세로 이동 = 기울기
    const slope = (on, w) => {
      const pr = 1 / (CELLS * 2);                                 // 밀도 곱(≤2)을 받아도 획 하나(반올림)
      const cen = (t) => { const r = knob(on, () => draw({ precip: pr, tempC: -5, wind: w }, t)); if (r.n !== 1) return null;
        let sx = 0, sy = 0, k = 0; for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (r.px[(y * CW + x) * 4 + 3] > 40) { sx += x; sy += y; k++; }
        return k ? [sx / k, sy / k, k] : null; };
      const S = [];
      for (let t = 1000; t < 12000 && S.length < 9; t += 613) {
        const p = cen(t), q = cen(t + 50);
        if (!p || !q) continue;
        const dx = q[0] - p[0], dy = q[1] - p[1];
        if (!(dy > 1) || Math.abs(dx) > CW / 2 || p[1] < 4 || q[1] > CH - 4) continue;   // 감아 돈(화면 밖으로 나간) 판은 건너뛴다
        S.push(dx / dy);
      }
      S.sort((a, b) => a - b);
      return { n: S.length, slope: S.length ? +S[S.length >> 1].toFixed(3) : null };
    };
    out.slopes = [];
    for (const w of [0.05, 0.3, -0.3]) out.slopes.push({ w, on: slope(true, w), off: slope(false, w) });
    out.K = WX_TILT_K; out.RAIN = WX_RAIN_PXPS; out.SNOW = WX_SNOW_PXPS; out.MAX = WX_MAX; out.CELL = WX_CELL_AREA;
    // ⓔ 앞 — 진짜 화면 바닥 재료(획당 화소 · 눈보라 한 판)
    const one = knob(true, () => draw({ precip: 1 / 64, tempC: -5, wind: 0.3 }, 5000));
    out.perStroke = one.n ? ink(one.px) / one.n : null;
    window.__rainForce({ precip: 0 });
    return out;
  });
  ok(iso.nil.nOn === iso.nil.nOff && iso.nil.nOn === iso.CELLS && iso.nil.same && iso.nil.ink > 0,
    '★★ⓑ **무풍 눈 = 종전 눈** — 켬/끔 두 판이 획 수도 화소도 한 톨 안 다르다(곱 1 · 기울기 0)', `획 ${iso.nil.nOn} · 화소 ${iso.nil.ink}`);
  ok(iso.rain.same && iso.rain.bz === false, '★ⓑ 비는 바람이 불어도 켬/끔 **동일** — 눈보라는 눈에만(어는점 하나가 가른다)', `획 ${iso.rain.n}`);
  ok(!iso.windy.same && iso.windy.nOn > iso.windy.nOff && iso.windy.inkOn > iso.windy.inkOff,
    '★ⓑ 반례 — 바람 0.3 의 눈은 켬/끔이 **갈린다**(획 · 화소 둘 다 는다)', `획 ${iso.windy.nOff}→${iso.windy.nOn} · 화소 ${iso.windy.inkOff}→${iso.windy.inkOn}`);
  const clampT = (w) => Math.max(-1, Math.min(1, w * iso.K));
  const densOk = iso.dens.every((r) => r.on === Math.min(iso.MAX, Math.round(iso.CELLS * 0.5 * (1 + Math.abs(clampT(r.w))))) && r.off === Math.round(iso.CELLS * 0.5));
  ok(densOk, '★★ⓒ 밀도 = 넓이 × precip × (1 + |바람 × WX_TILT_K|, 상한 1) — **바람 세기 비례**(부호 무관 · 끔은 종전 그대로)',
    iso.dens.map((r) => `w${r.w}:${r.off}→${r.on}`).join(' '));
  const ratio = iso.RAIN / iso.SNOW;
  ok(iso.dens.every((r) => Math.abs(r.tilt - +(clampT(r.w) * ratio).toFixed(4)) < 1e-9 && Math.abs(r.tiltOff - +clampT(r.w).toFixed(4)) < 1e-9),
    `★ⓒ 기울기 값 = 공기 자 × 낙하 속도 비(${iso.RAIN}/${iso.SNOW} = ${ratio}) · 끔은 공기 자 그대로`, iso.dens.map((r) => `${r.tiltOff}→${r.tilt}`).join(' '));
  for (const s of iso.slopes) {
    const tA = clampT(s.w), tB = tA * ratio;
    const onNear = s.on.slope !== null && Math.abs(s.on.slope - tB) < Math.abs(s.on.slope - tA);
    const offNear = s.off.slope !== null && Math.abs(s.off.slope - tA) < Math.abs(s.off.slope - tB);
    ok(s.on.n >= 3 && s.off.n >= 3 && onNear && offNear,
      `★ⓓ 바람 ${s.w} — 화소로 잰 움직임 기울기가 켬은 **눈보라 식**(${tB.toFixed(2)}), 끔은 **종전 식**(${tA.toFixed(2)})에 더 가깝다`,
      `켬 ${s.on.slope}(${s.on.n}판) · 끔 ${s.off.slope}(${s.off.n}판)`);
  }
  const sp = iso.slopes.find((s) => s.w === 0.3), sn = iso.slopes.find((s) => s.w === -0.3);
  ok(sp && sn && sp.on.slope > 0 && sn.on.slope < 0, '★ⓓ 바람 부호를 뒤집으면 눈보라 기울기 부호도 뒤집힌다(계절풍의 방향)', `${sp && sp.on.slope} / ${sn && sn.on.slope}`);

  // ══ ⓔ 진짜 화면 — 눈보라가 프레임에 실제로 꽂혀 있다 ══════════════════════════════
  say('\n[ⓔ 진짜 화면 — 맑음↔눈보라를 붙여서 여러 판, 잡음 바닥 위에서 판정한다]');
  await rain({ precip: 1, tempC: -5, wind: 0.3 }); await sleep(500);
  const SCR = await page.evaluate(() => ({ w: W, h: H, n: window.__rainDbg().n, bz: window.__rainDbg().blizzard }));
  ok(SCR.bz === true && SCR.n === Math.min(iso.MAX, Math.round(SCR.w * SCR.h / iso.CELL * (1 + Math.abs(clampT(0.3))))),
    '★진짜 화면에서도 같은 밀도식이 선다(켬 · 눈 · 바람 0.3)', JSON.stringify({ 화면: `${SCR.w}×${SCR.h}`, 획: SCR.n }));
  const Rr = [];
  for (let i = 0; i < 3; i++) {
    await rain({ precip: 0 }); await sleep(500); const c1 = await shot(`10-c${i}a`);
    await sleep(500); const c2 = await shot(`11-c${i}b`);
    await rain({ precip: 1, tempC: -5, wind: 0.3 }); await sleep(500); const r1 = await shot(`12-b${i}`);
    Rr.push({ noise: diffPx(c1, c2), sig: diffPx(c2, r1) });
    say(`    R${i + 1}: 눈보라 효과 ${Rr[i].sig}px · 같은 조건 잡음 ${Rr[i].noise}px`);
  }
  const sig = med(Rr.map((x) => x.sig)), noise = med(Rr.map((x) => x.noise));
  const boxFrac = ((GBOX[2] - GBOX[0]) * (GBOX[3] - GBOX[1])) / (SCR.w * SCR.h);
  const FLOOR = Math.round((iso.perStroke || 0) * SCR.n * boxFrac * 0.5);   // 획당 화소(격리 실측) × 획 × 상자몫 ÷ 2 — e2e-weather 바닥 문법
  say(`    바닥 ${FLOOR}px = 획당 ${(iso.perStroke || 0).toFixed(1)}화소(격리 실측) × 획 ${SCR.n} × 상자몫 ${(boxFrac * 100).toFixed(0)}% ÷ 2`);
  ok(sig > Math.max(noise * 8, FLOOR), '★★ⓔ 눈보라가 화면에 실제로 실린다 — 잡음 바닥의 8배(e2e-weather 자)이면서 기하가 예고한 화소의 절반 위',
    `${sig}px > max(${noise * 8}, ${FLOOR})`);
  await rain({ precip: 0 }); await sleep(500); const m1 = await shot('13-mut-a'); await sleep(500); const m2 = await shot('14-mut-b');
  const mut = diffPx(m1, m2);
  ok(!(mut > Math.max(noise * 8, FLOOR)), '★★ⓔ 돌연변이 — 맑음을 "눈보라" 자리에 넣으면 그 판정이 안 선다', `${mut}px`);

  // ══ ⓕ 성능 — 층 하나의 값 · 자는 밤 오버레이(족보 74 · T93 ⓔ) ═══════════════════════
  say('\n[ⓕ 성능 — 같은 자리에 이미 그리는 밤 오버레이가 자다 (T93 ⓔ 문법 · 최악 판 = precip 1 · 바람 1)]');
  const perf = await page.evaluate(() => {
    const REP = 30;
    const flush = () => ctx.getImageData(0, 0, 1, 1).data[0];   // ★캔버스는 명령을 미룬다 — 래스터까지 강제
    const timeIt = (fn) => { const t0 = performance.now(); for (let i = 0; i < REP; i++) fn(i); flush(); return performance.now() - t0; };
    const nop = () => {};
    const night = () => { const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.45);
      g.addColorStop(0, 'rgba(10, 18, 40, 0.05)'); g.addColorStop(0.5, 'rgba(8, 14, 32, 0.45)'); g.addColorStop(1, 'rgba(4, 8, 20, 0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    const wxF = (k) => drawWeather(ctx, W, H, k * 17);
    const had = ('frost' in myWeather), v = myWeather.frost;
    const off = () => { delete myWeather.frost; }, on = () => { myWeather.frost = had ? v : 0; };
    for (let i = 0; i < 3; i++) { timeIt(nop); timeIt(night); window.__rainForce({ precip: 1, tempC: -5, wind: 1 }); timeIt(wxF); }
    const acc = { nop: [], night: [], snow: [], bliz: [] }; let nS = 0, nB = 0;
    for (let r = 0; r < 5; r++) {
      acc.nop.push(timeIt(nop));
      acc.night.push(timeIt(night));
      window.__rainForce({ precip: 1, tempC: -5, wind: 1 });
      off(); acc.snow.push(timeIt(wxF)); nS = window.__rainDbg().n;
      on(); acc.bliz.push(timeIt(wxF)); nB = window.__rainDbg().n;
    }
    if (had) myWeather.frost = v; else delete myWeather.frost;
    window.__rainForce({ precip: 0 });
    return { REP, W, H, acc, nS, nB, MAX: WX_MAX, CELL: WX_CELL_AREA };
  });
  const base = med(perf.acc.nop);
  const per = (k) => (med(perf.acc[k]) - base) / perf.REP;
  const nightMs = per('night'), snowMs = per('snow'), blizMs = per('bliz');
  say(`    ${perf.W}×${perf.H} · REP ${perf.REP} · 5판 중앙값 — 밤 오버레이 ${nightMs.toFixed(3)}ms · 눈(끔 · 획 ${perf.nS}) ${snowMs.toFixed(3)}ms · 눈보라(켬 · 획 ${perf.nB}) ${blizMs.toFixed(3)}ms`);
  ok(nightMs > 0.05, '★계기 신뢰 — 자(밤 오버레이) 자체가 잴 만한 값이다', `${nightMs.toFixed(3)}ms`);
  ok(perf.nB === Math.min(perf.MAX, Math.round(perf.W * perf.H / perf.CELL * 2)) && perf.nS === Math.min(perf.MAX, Math.round(perf.W * perf.H / perf.CELL)),
    '전제: 최악 판의 획 수 = 밀도식 그대로(눈보라는 × 2 · 상한 `WX_MAX` 에서 멈춘다)', `눈 ${perf.nS} · 눈보라 ${perf.nB} · 상한 ${perf.MAX}`);
  ok(blizMs < nightMs, '★★ⓕ 가장 비싼 눈보라 한 판도 밤 오버레이 한 판보다 싸다(T93 규약 · 같은 판에서 잰 두 값)',
    `${blizMs.toFixed(3)}ms < ${nightMs.toFixed(3)}ms (${(blizMs / Math.max(1e-6, nightMs)).toFixed(2)}배 · 눈 대비 ${(blizMs / Math.max(1e-6, snowMs)).toFixed(2)}배)`);

  // ══ ⓖ 프레임 짝 — 맑음/눈보라/맑음' (T93 ⓕ 문법 · SwiftShader 프레임) ═══════════════════
  say('\n[ⓖ 프레임 짝 — 맑음/눈보라/맑음\' 를 붙여서, 더한 ms 를 밤 오버레이와 잰다]');
  await page.evaluate(() => {
    // 프레임 계기는 제품이 이미 갖고 있다(`_gAcc`·`_gN` — 31-m-move 루프) · 프레임마다 `getImageData` 로 래스터까지 강제(T93 ⓕ)
    window.__bzSample = (nFrames) => new Promise((res) => {
      const rec = [], ras = []; let pa = window._gAcc || 0, pn = window._gN || 0;
      const step = () => {
        const a = window._gAcc || 0, n = window._gN || 0;
        const f0 = performance.now(); ctx.getImageData(0, 0, 1, 1); const fl = performance.now() - f0;
        if (n === pn + 1 && a >= pa) { rec.push(+(a - pa).toFixed(3)); ras.push(+fl.toFixed(3)); }
        pa = window._gAcc || 0; pn = window._gN || 0;
        if (rec.length < nFrames) requestAnimationFrame(step); else res({ rec, ras });
      };
      requestAnimationFrame(step);
    });
  });
  // ★자리 — e2e-weather ⓕ 가 재는 **그 자리**(존 로컬 셀 142,141 · 빈 땅)로 옮긴다. 숲·산이 가득한 스폰 둘레는 한 장이
  //   380ms 대라(1판 실측 · 잡음 ±20ms) 4ms 짜리 층이 **원리적으로 안 보인다** — T93 이 그 자리에서 잰 것과 같은 판에서 잰다.
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [142 * 32 + 16, 141 * 32 + 16]);
  await sleep(4000);
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  const FR = 60;
  const frame = async (f) => { await rain(f); await sleep(250);
    const r = await page.evaluate((k) => window.__bzSample(k), FR);
    return { rec: med(r.rec), ras: med(r.ras), all: med(r.rec) + med(r.ras) }; };
  const FP = [];
  for (let i = 0; i < 5; i++) {
    const A1 = await frame({ precip: 0 });
    const N1 = await frame({ precip: 1, tempC: -5, wind: 1 });   // 최악 판(상한까지 · 가장 누운 획)
    const B1 = await frame({ precip: 0 });
    FP.push({ a: A1.all, rn: N1.all, b: B1.all, rW: N1.all / A1.all, rN: B1.all / A1.all });
    say(`    R${i + 1}: 맑음 ${A1.all.toFixed(2)}ms · 눈보라 ${N1.all.toFixed(2)}ms(기록 ${N1.rec.toFixed(2)} + 래스터 ${N1.ras.toFixed(2)}) · 맑음' ${B1.all.toFixed(2)}ms`
      + ` → 눈보라 ${(N1.all / A1.all).toFixed(3)} · 잡음 ${(B1.all / A1.all).toFixed(3)}`);
  }
  await rain({ precip: 0 });
  const rW = med(FP.map((x) => x.rW)), frameMs = med(FP.map((x) => x.a));
  const addMs = (rW - 1) * frameMs, noiseMs = Math.max(...FP.map((x) => Math.abs(x.rN - 1))) * frameMs;
  say(`    한 장 ${frameMs.toFixed(1)}ms · 눈보라가 더한 값 ${addMs.toFixed(2)}ms · 같은 조건 잡음 폭 ±${noiseMs.toFixed(2)}ms`
    + ` · [참고 — 판정 아님] 프레임 몫 ${(addMs / frameMs * 100).toFixed(0)}% · 60fps 예산의 ${(frameMs / (1000 / 60) * 100).toFixed(0)}%`);
  const seen = addMs / Math.max(1e-6, blizMs);
  if (seen < 0.5) {
    fail++; say(`  ✗ ★★유보 — 프레임 계기가 층을 못 본다(층 ${blizMs.toFixed(2)}ms 인데 프레임엔 ${addMs.toFixed(2)}ms) · 이 절의 값은 못 믿는다`);
  } else {
    ok(true, '★계기 신뢰 — 프레임이 층의 값을 실제로 본다(층 대비)', `${(seen * 100).toFixed(0)}%`);
    ok(addMs < nightMs, '★★ⓖ 눈보라가 프레임에 더한 ms 가 밤 오버레이 한 판보다 작다(같은 판에서 잰 두 값 · T93 ⓕ)',
      `${addMs.toFixed(2)}ms < ${nightMs.toFixed(2)}ms`);
  }

  say(`\n=== 눈보라: 통과 ${pass} · 실패 ${fail} ===`);
  if (errs.length) say(`  [pageerror] ${errs.slice(0, 3).join(' | ')}`);
  await browser.close(); shutdown(); try { fs.unlinkSync(WRAP); } catch (e) { }
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); shutdown(); process.exit(1); });
