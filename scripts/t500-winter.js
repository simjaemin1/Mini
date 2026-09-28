#!/usr/bin/env node
// === scripts/t500-winter.js — 겨울 이펙트 넷 한 장(재민 눈) [T500 2026-09-28] ==================
//
// ★카드 ④ "스크린샷 넷(눈보라 낮/밤 · 입김 · 서리 아침) → `~/Mini/산그림/T500_겨울.png`"
//   하네스가 아니다(판정 0 · 이름이 `test-`·`e2e-` 가 아니라 러너·린트가 안 줍는다) — **그림을 만드는 자**다.
//
// ★세계를 바꾸지 않는다. 세우는 것은 테스트 전용 문과 진단 훅뿐이다:
//   `__e2e_clock`(날짜·밤낮) · 하늘 위상(래퍼 — 판마다 다시 들어가 welcome 으로 받는다) · `__rainForce`(**눈보라 낮 한 장만**)
//   ⚠낮 눈보라는 지금 세계에서 **안 온다** — 한겨울 낮이 영상이다(T487 표 · 기온은 T484 의 손). 그래서 그 한 장은
//     그날 **밤의 값**(강수·기온·바람)을 빌려 낮 하늘에 세운다. 나머지 셋은 세계 값 그대로다.
//   손잡이 `T500_WINTER_FX=1`(카드의 손잡이 하나) + `T487_SNOW=1`(겨울 수관·적설 — 재민 눈에 겨울 한 벌) + `CHAR_SPRITE=on`(라이브 env).
//
// 날 고르기 — 전부 정본 세계(`weather.js`·`snow.js`)에서 **규칙으로** 뽑는다(날짜를 지어내지 않는다):
//   눈보라 = 한겨울 가운데(`anchorDays().winter`)에서 가장 가까운 **눈 오는 밤**(강수 > 0 ∧ 밤 < 0℃)
//   입김   = 한겨울 가운데에서 가장 가까운 **맑은 언 밤**(강수 0 ∧ 밤 < 0℃)
//   서리   = 첫 겨울 **맑은** 서리 아침 가운데 F₀ 가 **중앙값**인 아침(가장 흔한 세기 — 제일 하얀 날을 고르지 않는다)
//
// 실행: node scripts/t500-winter.js <out.png>      (NODE_PATH 에 playwright · pngjs 는 저장소 것)
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FB = require('./fixture-boot');
const FX = require('./fixture-clock');
const Wx = require(path.join(ROOT, 'server', 'weather.js'));
const Snow = require(path.join(ROOT, 'server', 'snow.js'));
const Wind = require(path.join(ROOT, 'server', 'wind.js'));
const OUT = process.argv[2] || '/tmp/T500_겨울.png';
const TMP = path.join(path.dirname(OUT), 't500-winter-shots');
fs.mkdirSync(TMP, { recursive: true });
const CPORT = 3010, ZPORT = 3020;
const ZDB = `/tmp/t500-winter-${process.pid}.db`, CDB = `/tmp/t500-winter-c-${process.pid}.db`;
const PHF = `/tmp/t500-winter-phase-${process.pid}.txt`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(file, env) { const p = spawn('node', [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); procs.push(p); return p; }
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, CDB]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };
process.on('exit', shutdown);
// 하늘 위상을 **판마다** 바꾼다 — 래퍼가 파일 하나를 지켜보다 세계 시계의 기점을 옮긴다(하루 = 실시간 하루라 그 자리에 선다).
//   클라는 위상을 입장 때(welcome `worldClock`) 받으므로 판마다 다시 들어간다(t487-seasons 와 같은 문법).
const WRAP = `/tmp/zone-wrap-t500-${process.pid}.js`;
fs.writeFileSync(PHF, '0.25');
fs.writeFileSync(WRAP, `const path=require('path');const fs=require('fs');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d;
const setPh=(p)=>{ cfg.WORLD.worldEpoch=Date.now()-Math.round(d*p); };
setPh(parseFloat(fs.readFileSync(${JSON.stringify(PHF)},'utf8'))||0.25);
fs.watchFile(${JSON.stringify(PHF)},{interval:200},()=>{ try{ const v=parseFloat(fs.readFileSync(${JSON.stringify(PHF)},'utf8')); if(Number.isFinite(v)) setPh(v); }catch(e){} });
require(path.join(ROOT,'server','zone.js'));`);

// ── 날 고르기(정본 세계) ──
const A = FX.anchorDays();
const nearWinter = (pred) => { for (let k = 0; k < 120; k++) for (const d of [A.winter - k, A.winter + k]) if (pred(d)) return d; return null; };
const D_BLIZ = nearWinter((d) => Wx.precipAt(d) > 0 && Wx.tempAt(d, true, 0) < 0);
const D_BREATH = nearWinter((d) => !(Wx.precipAt(d) > 0) && Wx.tempAt(d, true, 0) < 0);
// 서리 아침은 **맑은 아침**만 고른다(그날 강수 0) — 비 오는 아침은 빗줄기가 땅을 가려 서리를 못 본다(그림의 일 · 세계는 그대로).
const FROSTS = [];
for (let n = A.winter - 91; n < A.winter + 91; n++) { const f = Snow.frostOf(n); if (f > 0 && !(Wx.precipAt(n + 1) > 0)) FROSTS.push({ night: n, f }); }
const _sorted = FROSTS.slice().sort((a, b) => a.f - b.f);
const MED = _sorted[_sorted.length >> 1];
const D_FROST = MED ? MED.night + 1 : null;             // 서리는 **다음 아침**에 보인다
// 서리 아침의 하늘 — 해 뜬 직후. 녹는 순간(F₀ ÷ 낮 기온 · 날)의 **절반**에서 찍는다(아직 녹기 전 · 해는 이미 떴다).
const MELT = MED ? MED.f / Math.max(1e-9, Snow.meltOf(D_FROST)) : 0;
const PH_FROST = +(MELT / 2).toFixed(4);
const SHOTS = [
  { key: 'bliz_day', ko: '눈보라 · 낮', day: D_BLIZ, night: false, phase: 0.25,
    force: { precip: +Wx.precipAt(D_BLIZ).toFixed(4), tempC: +Wx.tempAt(D_BLIZ, true, 0).toFixed(1), wind: +Wind.seasonWind(D_BLIZ).toFixed(4) } },
  { key: 'bliz_night', ko: '눈보라 · 밤', day: D_BLIZ, night: true, phase: 0.8, force: null },
  { key: 'breath', ko: '입김 · 맑은 언 밤', day: D_BREATH, night: true, phase: 0.8, force: null, zoom: 4 },
  { key: 'frost', ko: '서리 아침', day: D_FROST, night: false, phase: PH_FROST, force: null },
];
console.log(JSON.stringify({ winterMid: A.winter, D_BLIZ, D_BREATH, D_FROST, F0: MED && +MED.f.toFixed(4), F0rank: `${_sorted.indexOf(MED) + 1}/${_sorted.length}`, melt: +MELT.toFixed(4), PH_FROST }));

(async () => {
  const c = boot('server/central.js', { PORT: String(CPORT), DB_PATH: CDB, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' });
  const z = boot(WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1', T487_SNOW: '1', T500_WINTER_FX: '1',
    CHAR_SPRITE: 'on' });   // ★라이브 컨테이너 env 그대로(BENCHMARK.md · t469 리허설) — 몸이 시트로 서야 입 자리를 안다
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
  // 자리 = 마을 한복판에서 들판 쪽(T487 사계와 같은 자리 규칙 — 울타리 안이면 시야가 막힌다)
  const SPOT = [V.cx * 32 + 16 + (+process.env.T500_SPOT_DX || 350), V.cy * 32 + 16 + (+process.env.T500_SPOT_DY || 350)];
  const done = [];
  for (const S of SHOTS) {
    fs.writeFileSync(PHF, String(S.phase)); await sleep(800);
    if (!(await enter())) { console.log('입장 실패', S.key); continue; }
    const fx = await FX.setClock(page, { day: S.day, night: S.night });
    await page.evaluate(() => { window.__terrain19.windOff = true; });
    await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
    await page.evaluate((f) => window.__rainForce(f), S.force);
    await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), SPOT);
    await sleep(9000);                                  // 카메라 트윈 · 타일 굽기 · 철 판 그림 받기
    if (S.key === 'breath') {
      // 숨 한 주기(4.44초) 안에서 **내 입김이 반쯤 자란** 판을 기다린다(획이 0 길이면 그림에 없다)
      for (let i = 0; i < 200; i++) {
        const b = await page.evaluate(() => (window.__breathDbg ? window.__breathDbg() : null));
        const me = b && b.strokes.find((s) => s.me);
        if (me && me.e > 0.35 && me.e < 0.6) break;
        await sleep(40);
      }
    }
    const info = await page.evaluate(() => ({ wx: window.__wx ? window.__wx() : null, rain: window.__rainDbg ? window.__rainDbg() : null,
      breath: window.__breathDbg ? window.__breathDbg() : null, badge: (document.getElementById('wxBadge') || {}).textContent }));
    const p = path.join(TMP, `${S.key}.png`);
    await page.screenshot({ path: p });
    done.push({ ...S, p, info });
    console.log(JSON.stringify({ key: S.key, day: S.day, night: S.night, phase: S.phase, fx: fx.ok, tempC: info.wx && info.wx.tempC, precip: info.wx && info.wx.precip,
      wind: info.wx && info.wx.wind, snow: info.wx && info.wx.snow, frost: info.wx && info.wx.frost, rain: info.rain, breathN: info.breath && info.breath.n,
      breathMe: info.breath && info.breath.strokes.find((s) => s.me), badge: (info.badge || '').trim() }));
  }
  await browser.close();
  // ── 2×2 한 장 — 좌상 눈보라 낮 · 우상 눈보라 밤 · 좌하 입김(가운데 ×4 확대) · 우하 서리 아침 ──
  const { PNG } = require('pngjs');
  const ims = done.map((s) => {
    const im = PNG.sync.read(fs.readFileSync(s.p));
    if (!s.zoom) return im;
    // 입김은 몸 크기(키 54px)의 획이라 한 화면에선 점이다 — 내 몸 둘레를 **최근접 ×4** 로 키운다(다시 그리지 않는다 · 화소 그대로)
    const me = s.info.breath && s.info.breath.strokes.find((q) => q.me);
    const cx = me ? Math.round(me.a[0]) : im.width >> 1, cy = me ? Math.round(me.a[1]) : im.height >> 1;
    const w = Math.floor(im.width / s.zoom), h = Math.floor(im.height / s.zoom);
    const x0 = Math.max(0, Math.min(im.width - w, cx - (w >> 1))), y0 = Math.max(0, Math.min(im.height - h, cy - (h >> 1)));
    const z2 = new PNG({ width: im.width, height: im.height });
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
      const si = ((y0 + Math.floor(y / s.zoom)) * im.width + (x0 + Math.floor(x / s.zoom))) * 4, di = (y * im.width + x) * 4;
      im.data.copy(z2.data, di, si, si + 4);
    }
    return z2;
  });
  const w = ims[0].width, h = ims[0].height, G = 8;
  const out = new PNG({ width: w * 2 + G, height: h * 2 + G });
  out.data.fill(255);
  ims.forEach((im, k) => {
    const ox = (k % 2) * (w + G), oy = ((k / 2) | 0) * (h + G);
    for (let y = 0; y < h; y++) im.data.copy(out.data, ((oy + y) * out.width + ox) * 4, y * w * 4, (y + 1) * w * 4);
  });
  fs.writeFileSync(OUT, PNG.sync.write(out));
  console.log('→', OUT, `${out.width}x${out.height}`, errs.length ? `pageerror ${errs.length}: ${errs[0]}` : 'pageerror 0');
  shutdown(); for (const f of [WRAP, PHF]) { try { fs.unwatchFile(f); fs.unlinkSync(f); } catch (e) { } }
  process.exit(0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
