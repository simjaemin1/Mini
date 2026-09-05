#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// e2e-weather — 비·눈 화면 효과 실클라 E2E [T93 · T21 첫 판]
//
// 재는 것은 **화면**이다. `37-r1-weather.js` 는 판정을 한 줄도 안 하므로 계약 검사가 할 일이 없고,
// 할 수 있는 유일한 정직한 질문은 *"화면에 실제로 나타나는가 · 안 나타나야 할 때 안 나타나는가"* 다.
//
// ★★두 층에서 잰다 — 하나만 보면 반쪽이다:
//   ⓒ **격리 캔버스** — `drawWeather(ctx,W,H,t)` 는 ctx 를 인자로 받는다. 하네스가 빈 캔버스를
//      주면 **세계 없이 이 층만** 결정적으로 그려진다(같은 t = 같은 그림). 획 하나까지 셀 수 있다.
//   ⓓ **진짜 화면** — 그 층이 실제 프레임에 **꽂혀 있는지**는 격리 캔버스가 절대 답 못 한다
//      (등록 줄이나 호출 줄을 지워도 ⓐ 는 초록이다). 그래서 스크린샷 짝 비교를 따로 한다.
//
// ★자명한 통과 금지: 매 판정 앞에 **상황이 성립했는지**를 먼저 세운다(내가 정말 실내인가 ·
//   지금 정말 비가 켜져 있는가), 그리고 판정마다 **돌연변이**로 빨개지는 걸 같은 판에서 보인다.
//
// 사용: node scripts/e2e-weather.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-weather-${process.pid}.db`;
const SHOTS = process.env.SHOTS || '/tmp/e2e-weather-shots';
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m, extra) => { if (c) { pass++; say(`  ✓ ${m}` + (extra !== undefined ? `  ${extra}` : '')); }
                              else { fail++; say(`  ✗ ${m}` + (extra !== undefined ? `  ${extra}` : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
try { execSync(`pkill -f "serve[r]/zone.js" ; pkill -f "centra[l].js" ; pkill -f "zone-wra[p]"`, { stdio: 'ignore' }); } catch (e) {}

const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 120)); });
  p.stderr.on('data', () => {});
  procs.push(p); return p;
}
process.on('exit', () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) {} } });
async function waitHttp(url, tries = 600) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
// ★하루를 **정오에 멈춘다**. 안 그러면 밤 오버레이가 켜졌다 꺼졌다 하면서 화면 짝 비교의
//   잡음 바닥이 통째로 흔들린다(e2e-rooms 가 같은 함정을 이미 적어 뒀다 — 그 wrap 을 본떴다).
function writeWrap() {
  fs.writeFileSync('/tmp/zone-wrap-weather.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID=process.env.ZONE_ID||'hanbando';
if(process.env.WRAP_DAY_MS){const d=parseInt(process.env.WRAP_DAY_MS,10);
  cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);}
try{const patch=JSON.parse(process.env.WRAP_ZONE_PATCH||'{}');Object.assign(cfg.ZONES[ZID],patch);}catch(e){}
require(path.join(ROOT,'server','zone.js'));`);
  return '/tmp/zone-wrap-weather.js';
}
// ── 방 하나를 미리 짓는다(실내 판정용) — e2e-rooms 의 `seedHouse` 와 같은 문법 ────────────
const SZ = 32;
const RECT = (x0, y0, x1, y1) => { const o = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };
function seedHouse(dbPath, cells) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath); const now = Date.now();
  const ins = db.prepare('INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at) VALUES (?,?,?,?,?,?,?)');
  const S = new Set(cells.map(([x, y]) => `${x},${y}`));
  let nf = 0, nw = 0;
  for (const [x, y] of cells) { ins.run('floor', 'e2e', 'E2E', x * SZ, y * SZ, JSON.stringify({ floor: 0 }), now); nf++; }
  const edges = [];
  for (const [x, y] of cells) {
    if (!S.has(`${x},${y - 1}`)) edges.push([x, y, 'N']);
    if (!S.has(`${x},${y + 1}`)) edges.push([x, y + 1, 'N']);
    if (!S.has(`${x + 1},${y}`)) edges.push([x, y, 'E']);
    if (!S.has(`${x - 1},${y}`)) edges.push([x - 1, y, 'E']);
  }
  for (const [x, y, s] of edges) {
    ins.run('wall', 'e2e', 'E2E', x * SZ, y * SZ, JSON.stringify({ side: s, floor: 0 }), now); nw++;
  }
  db.close(); return { floors: nf, walls: nw };
}
// ★게임 화면 상자 — HUD 제외. `e2e-nature`·`e2e-rooms` 가 쓰는 **같은 값**이다
//   (위쪽 띠는 시계·숫자가 계속 바뀌어 한 쌍에 수천 화소씩 흔들린다 — 재는 층 격리).
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
  say('=== 비·눈 화면 효과 실클라 E2E (T93) ===');
  const wrap = writeWrap();
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(ZDB + s); } catch (e) {} }
  boot('central', path.join(ROOT, 'server', 'central.js'),
       { PORT: String(CPORT), DB_PATH: `/tmp/e2e-weather-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  ok(await waitHttp(`http://localhost:${CPORT}/zones`), 'central 기동');

  // 스키마를 만들 1차 부팅 → 끄고 집을 심는다
  {
    const z0 = boot('zone0', path.join(ROOT, 'server', 'zone.js'), {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0',
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'DB 스키마 생성용 1차 부팅');
    try { z0.kill(); } catch (e) {} await sleep(2000);
  }
  const HOUSE = RECT(100, 100, 104, 103);          // 5×4 = 20칸
  const IN = { cx: 102, cy: 101 };                  // 방 한가운데
  const seeded = seedHouse(ZDB, HOUSE);
  ok(seeded.floors === 20, `★검사 전제 — 집이 DB 에 실제로 들어갔다 (바닥 ${seeded.floors}칸 · 벽 ${seeded.walls}장)`);

  boot('zone', wrap, {
    PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    ENABLE_VILLAGES: '0', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1',
    WRAP_DAY_MS: '86400000',        // 하루 24시간 · epoch 을 정오에 — 조명 변화 ≈ 0
    WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: IN.cx * SZ + 16, y: IN.cy * SZ + 16, name: '날씨 시험 방' } }),
  });
  ok(await waitHttp(`http://localhost:${ZPORT}/health`), 'zone 기동');
  await sleep(3000);

  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`, { waitUntil: 'domcontentloaded' });
  await sleep(2500);
  await page.fill('#name', 'wx');
  // ★[T84] 로비 버튼은 글자가 아니라 **id**(`#enter`) 로 집는다 — 라벨이 바뀌어도 안 죽는다
  //   (`test-harness-lint ③` 이 이걸 검사한다 — 1차 작성이 실제로 거기 걸렸다).
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  await sleep(12000);
  // ★바람을 끈다 — 지면 풀 카펫이 프레임마다 흔들려 짝 비교의 잡음 바닥을 통째로 먹는다
  //   (T87 이 대조군 0px 을 얻으려고 격리한 그 층과 같다).
  await page.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
  await sleep(600);

  const rain = (o) => page.evaluate((f) => window.__rainForce(f), o);
  const rdbg = () => page.evaluate(() => window.__rainDbg());
  const shot = async (n) => { const f = `${SHOTS}/${n}.png`; await page.screenshot({ path: f }); return PNG.sync.read(fs.readFileSync(f)); };

  // ══ ⓐ 계기가 산다 · 이름을 안 뺏었다 ══════════════════════════════════════════
  say('\n[ⓐ 계기 — 층이 실렸고, 남의 훅 이름을 안 뺏었다]');
  const wired = await page.evaluate(() => ({
    draw: typeof drawWeather === 'function',
    force: typeof window.__rainForce === 'function',
    dbg: typeof window.__rainDbg === 'function',
    mine: window.__rainDbg ? Object.keys(window.__rainDbg()) : null,
    tile: window.__wxDbg ? window.__wxDbg() : undefined,
    reg: [...document.querySelectorAll('script[src]')].some((s) => /37-r1-weather\.js/.test(s.src)),
  }));
  ok(wired.reg === true, '★`index.html` 이 이 조각을 실제로 등록했다(문서에서 확인 — 소스 짐작 아님)');
  ok(wired.draw && wired.force && wired.dbg, '`drawWeather` · 훅 둘이 산다', JSON.stringify({ d: wired.draw, f: wired.force, g: wired.dbg }));
  ok(Array.isArray(wired.mine) && wired.mine.includes('precip'), '내 진단 훅은 `precip` 을 가진다', JSON.stringify(wired.mine));
  // ★★이 줄이 이 카드에서 실제로 잡은 결함이다. 처음엔 훅을 `__wxDbg` 로 지었는데 그 이름은
  //   **날씨 사건(🌵가뭄) 축**의 것이었고(`34-m-renderloop.js:110`), 첫 프레임에 조용히 덮였다
  //   — `e2e-tilestate`·`e2e-village` 가 그걸 읽는다. `test-client-globals` 는 *선언* 충돌과
  //   *브라우저* 전역 충돌만 보므로 `window.__x = …` 재대입은 안 잡는다.
  ok(wired.tile === undefined || wired.tile === null || !('precip' in wired.tile),
     '★★남의 훅 `__wxDbg`(날씨 사건 축)를 **안 덮었다** — 이름 충돌 회귀 감시',
     JSON.stringify(wired.tile === null ? null : (wired.tile ? Object.keys(wired.tile) : wired.tile)));

  // ══ ⓑ 실내 — 지붕 아래선 안 그린다 ═════════════════════════════════════════════
  say('\n[ⓑ 실내 — 상황을 먼저 세우고(내가 정말 방 안이다) 그 다음 판정한다]');
  const room = await page.evaluate(() => (window.__roomDbg ? window.__roomDbg() : null));
  ok(!!room && room.indoors === true, '★검사 전제 — 클라가 "나는 실내다"라고 답한다(서버 방 판정이 화면 층까지 왔다)',
     JSON.stringify(room && { cx: room.cx, cy: room.cy, roomId: room.roomId, cells: room.roomCells }));
  await rain({ precip: 1, tempC: 5, wind: 0.3 }); await sleep(400);
  const dIn = await rdbg();
  ok(dIn.indoor === true && dIn.on === false && dIn.n === 0,
     '★★비를 최대로 켜도 실내면 **한 획도 안 그린다**', JSON.stringify(dIn));
  const inA = await shot('01-in-rain'); const inB = await shot('02-in-rain2');
  await rain({ precip: 0 }); await sleep(400);
  const inC = await shot('03-in-clear');
  const inNoise = diffPx(inA, inB), inSig = diffPx(inA, inC);
  ok(inSig <= Math.max(60, inNoise * 3), '★화면도 그대로다 — 비 켠 실내 vs 맑은 실내가 잡음 안',
     `효과 ${inSig}px · 잡음 ${inNoise}px`);

  // ══ 밖으로 나간다 ═══════════════════════════════════════════════════════════════
  say('\n[밖으로 — 집에서 40셀 떨어진 빈 땅으로 옮긴다]');
  const OUT = { x: (IN.cx + 40) * SZ + 16, y: (IN.cy + 40) * SZ + 16 };
  await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [OUT.x, OUT.y]);
  await sleep(4000);
  await page.evaluate(() => { if (window.__terrain19) window.__terrain19.windOff = true; });
  await sleep(600);
  const room2 = await page.evaluate(() => (window.__roomDbg ? window.__roomDbg() : null));
  ok(!!room2 && room2.indoors === false, '★검사 전제 — 이제 실외다', JSON.stringify(room2 && { cx: room2.cx, cy: room2.cy, indoors: room2.indoors }));

  // ══ ⓒ 격리 캔버스 — 획 하나까지 센다 ═══════════════════════════════════════════
  say('\n[ⓒ 격리 캔버스 — 세계 없이 이 층만 결정적으로 그려 획을 센다]');
  const iso = await page.evaluate(() => {
    // 넓이 = 아이소 셀 넓이(1,024px²)의 정수배가 되게 잡는다 ⇒ 획 수를 정확히 지정할 수 있다
    const CW = 128, CH = 128;                 // 16,384px² = 16셀 ⇒ precip=1/16 이면 획 1개
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    const lit = () => { const d = c2.getImageData(0, 0, CW, CH).data; const P = [];
      for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (d[(y * CW + x) * 4 + 3] > 40) P.push([x, y]);
      return P; };
    const clear = () => c2.clearRect(0, 0, CW, CH);
    const out = {};
    // ① 획 수 = 넓이 × precip (밀도식이 화면에 그대로 실린다)
    const counts = [];
    for (const pr of [1, 0.5, 0.25]) {
      window.__rainForce({ precip: pr, tempC: 5, wind: 0 });
      clear(); const n = drawWeather(c2, CW, CH, 1000);
      counts.push({ pr, n, want: Math.round(CW * CH / 1024 * pr), px: lit().length });
    }
    out.counts = counts;
    // ② 획 하나만 그려 **기울기 부호가 화소에 실리는지** 본다 — 획이 캔버스 안에 온전히
    //    들어오는 t 를 찾아 쓴다(자리를 고르지 않고 잰다).
    const oneTilt = (wind) => {
      window.__rainForce({ precip: 1 / 16, tempC: 5, wind });
      for (let t = 0; t < 4000; t += 7) {
        clear(); const n = drawWeather(c2, CW, CH, t);
        if (n !== 1) return { err: 'n≠1', n };
        const P = lit(); if (P.length < 6) continue;
        const ys = P.map((p) => p[1]), xs = P.map((p) => p[0]);
        const y0 = Math.min(...ys), y1 = Math.max(...ys), x0 = Math.min(...xs), x1 = Math.max(...xs);
        if (y0 < 2 || y1 > CH - 3 || x0 < 2 || x1 > CW - 3) continue;   // 잘린 획은 건너뛴다
        const top = P.filter((p) => p[1] <= y0 + 1).map((p) => p[0]);
        const bot = P.filter((p) => p[1] >= y1 - 1).map((p) => p[0]);
        const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
        return { t, n, px: P.length, h: y1 - y0, dx: +(avg(bot) - avg(top)).toFixed(2), dbg: window.__rainDbg() };
      }
      return { err: '온전한 획을 못 찾았다' };
    };
    out.windPos = oneTilt(0.5);
    out.windNeg = oneTilt(-0.5);
    out.windNil = oneTilt(0);
    // ③ 비와 눈은 화면에서 갈린다(길이·색)
    //   ★색은 **회색 바탕에 얹어** 잰다. 두 획은 알파가 다르므로(비 0.55 · 눈 0.88) 투명 캔버스의
    //     raw RGB 를 읽으면 알파가 빠진 '원료 색'이 나와 화면과 다르다 — 1차 작성이 그래서 빨갰다
    //     (비는 알파 0.55×안티에일리어싱이라 불투명 화소가 아예 없어 표본 0). 사람이 보는 값은
    //     **합성 뒤 밝기**다: 회색(128) 위에 얹고 가장 짙게 찍힌 화소의 밝기를 쓴다.
    const kind = (tempC) => { window.__rainForce({ precip: 1 / 16, tempC, wind: 0 });
      for (let t = 0; t < 4000; t += 7) {
        clear(); c2.fillStyle = '#808080'; c2.fillRect(0, 0, CW, CH);
        drawWeather(c2, CW, CH, t);
        const d = c2.getImageData(0, 0, CW, CH).data;
        let best = null, y0 = 1e9, y1 = -1e9, px = 0;
        for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const i = (y * CW + x) * 4;
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (Math.abs(lum - 128) < 6) continue;            // 바탕 그대로면 획이 아니다
          px++; if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (!best || lum > best.lum) best = { lum, rgb: [d[i], d[i + 1], d[i + 2]] };
        }
        if (!px || y0 < 2 || y1 > CH - 3) continue;
        return { h: y1 - y0, px, lum: best ? +best.lum.toFixed(1) : null, rgb: best ? best.rgb : null,
                 kind: window.__rainDbg().kind };
      }
      return { err: 'no' }; };
    out.rain = kind(5); out.snow = kind(-5);
    window.__rainForce(null);
    return out;
  });
  for (const c of iso.counts) ok(c.n === c.want && c.px > 0,
    `획 수가 **화면 넓이 × precip** 그대로다 (precip=${c.pr})`, `${c.n} = ${c.want} · 화소 ${c.px}`);
  ok(iso.windNil && iso.windNil.dx !== undefined && Math.abs(iso.windNil.dx) < 1.0,
     '바람 0 이면 획이 곧게 떨어진다', JSON.stringify(iso.windNil && { dx: iso.windNil.dx, h: iso.windNil.h }));
  ok(iso.windPos && iso.windPos.dx > 3, '★바람 +면 획이 **오른쪽으로 기운다**(화소로 잰 값)',
     JSON.stringify(iso.windPos && { dx: iso.windPos.dx, tilt: iso.windPos.dbg && iso.windPos.dbg.tilt }));
  ok(iso.windNeg && iso.windNeg.dx < -3, '★★바람 부호를 뒤집으면 **기울기 부호가 뒤집힌다**',
     JSON.stringify(iso.windNeg && { dx: iso.windNeg.dx, tilt: iso.windNeg.dbg && iso.windNeg.dbg.tilt }));
  ok(iso.windPos && iso.windNeg && Math.abs(iso.windPos.dx + iso.windNeg.dx) < 1.5,
     '두 기울기가 크기까지 대칭이다(부호만 다르다)', `${iso.windPos && iso.windPos.dx} / ${iso.windNeg && iso.windNeg.dx}`);
  ok(iso.rain.kind === 'rain' && iso.snow.kind === 'snow', '어는점 하나가 비/눈을 가른다 (5℃ → 비 · −5℃ → 눈)',
     JSON.stringify({ rain: iso.rain.kind, snow: iso.snow.kind }));
  ok(iso.rain.h > iso.snow.h * 3, '★비는 줄기, 눈은 점 — 화면에서 길이가 갈린다',
     `비 세로 ${iso.rain.h}px vs 눈 ${iso.snow.h}px`);
  ok(iso.snow.lum != null && iso.rain.lum != null && (iso.snow.lum - iso.rain.lum) > 20,
     '★눈이 비보다 밝다 — 회색 바탕에 **합성한 뒤**의 밝기로 잰다(사람이 보는 값)',
     JSON.stringify({ rain: { lum: iso.rain.lum, rgb: iso.rain.rgb }, snow: { lum: iso.snow.lum, rgb: iso.snow.rgb } }));

  // 다음 절(화면 판정)이 쓰는 값 — 이 절이 **실측한** 획당 화소와, 지금 화면이 실제로 그리는 획 수
  const ISO = iso;
  await rain({ precip: 1, tempC: 5, wind: 0.3 }); await sleep(500);
  const SCR = await page.evaluate(() => ({ w: W, h: H, n: window.__rainDbg().n }));
  ok(SCR.n === Math.min(1400, Math.round(SCR.w * SCR.h / 1024)),
     '★진짜 화면에서도 같은 밀도식이 선다(상한에 안 걸리면 넓이÷셀넓이)',
     JSON.stringify({ 화면: `${SCR.w}×${SCR.h}`, 획: SCR.n }));

  // ══ ⓓ 진짜 화면 — 비가 프레임에 실제로 꽂혀 있다 ═══════════════════════════════
  //   ★이 절만이 "등록 줄·호출 줄이 살아 있다"를 증명한다(ⓒ 격리 캔버스는 그걸 절대 못 본다).
  say('\n[ⓓ 진짜 화면 — 맑음↔비를 붙여서 여러 판, 잡음 바닥 위에서 판정한다]');
  const R = [];
  for (let i = 0; i < 3; i++) {
    await rain({ precip: 0 }); await sleep(500); const c1 = await shot(`10-c${i}a`);
    await sleep(500); const c2 = await shot(`11-c${i}b`);
    await rain({ precip: 1, tempC: 5, wind: 0.3 }); await sleep(500); const r1 = await shot(`12-r${i}`);
    R.push({ noise: diffPx(c1, c2), sig: diffPx(c2, r1) });
    say(`    R${i + 1}: 비 효과 ${R[i].sig}px · 같은 조건 잡음 ${R[i].noise}px → ${(R[i].sig / Math.max(1, R[i].noise)).toFixed(1)}배`);
  }
  const sig = med(R.map((x) => x.sig)), noise = med(R.map((x) => x.noise));
  const RATIO_K = parseFloat(process.env.WX_RATIO_K || '8') || 8;
  // ★★잡음 바닥만으로 판정하면 안 된다 — 이 화면은 하루를 멈추고 바람을 껐더니 잡음이 **정확히 0**
  //   이 나온다. `sig > 0 × 8` 은 화소 한 점만 달라도 통과다(자를 곱해도 0 은 0 이다).
  //   ⇒ **바닥을 하나 더 깐다.** 그 바닥은 눈대중이 아니라 ⓒ 가 격리 캔버스에서 잰 값에서 나온다:
  //     (획당 화소) × (지금 화면의 획 수) × (판정 상자가 화면에서 차지하는 비율) 의 절반.
  const perStroke = ISO.counts[0].px / ISO.counts[0].n;              // ⓒ 실측 — 획 하나가 남기는 화소
  const boxFrac = ((GBOX[2] - GBOX[0]) * (GBOX[3] - GBOX[1])) / (SCR.w * SCR.h);
  const FLOOR = Math.round(perStroke * SCR.n * boxFrac * 0.5);
  say(`    바닥 ${FLOOR}px = 획당 ${perStroke.toFixed(1)}화소(ⓒ 실측) × 획 ${SCR.n} × 상자몫 ${(boxFrac * 100).toFixed(0)}% ÷ 2`);
  ok(sig > Math.max(noise * RATIO_K, FLOOR),
     `★★비가 화면에 실제로 실린다 — 잡음 바닥의 ${RATIO_K}배이면서, 기하가 예고한 화소의 절반 위`,
     `${sig}px > max(${noise * RATIO_K}, ${FLOOR})`);
  {
    // ★★돌연변이 — '비' 자리에 맑음을 넣으면 같은 판정이 **빨개진다**(이 검사가 실패할 줄 안다)
    await rain({ precip: 0 }); await sleep(500); const m1 = await shot('13-mut-a');
    await sleep(500); const m2 = await shot('14-mut-b');
    const mut = diffPx(m1, m2);
    ok(!(mut > Math.max(noise * RATIO_K, FLOOR)), '★★돌연변이 — 맑음을 "비" 자리에 넣으면 그 판정이 안 선다', `${mut}px`);
  }

  // ══ ⓔ 성능 — 같은 자리에 이미 있는 오버레이(밤)를 자로 쓴다 ═════════════════════
  say('\n[ⓔ 성능 — 이 레포가 같은 자리에 이미 그리는 밤 오버레이가 자다 (족보 74)]');
  const perf = await page.evaluate(() => {
    const REP = 30;
    const flush = () => ctx.getImageData(0, 0, 1, 1).data[0];   // ★캔버스는 명령을 미룬다 — 래스터까지 강제
    const timeIt = (fn) => { const t0 = performance.now(); for (let i = 0; i < REP; i++) fn(i); flush(); return performance.now() - t0; };
    const nop = () => {};
    const night = () => { const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, Math.max(W, H) * 0.45);
      g.addColorStop(0, 'rgba(10, 18, 40, 0.05)'); g.addColorStop(0.5, 'rgba(8, 14, 32, 0.45)'); g.addColorStop(1, 'rgba(4, 8, 20, 0.85)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); };
    const rainF = (k) => drawWeather(ctx, W, H, k * 17);
    for (let i = 0; i < 3; i++) { timeIt(nop); timeIt(night); window.__rainForce({ precip: 1, tempC: 5, wind: 0.3 }); timeIt(rainF); }
    const acc = { nop: [], night: [], rain: [], snow: [] };
    for (let r = 0; r < 5; r++) {
      acc.nop.push(timeIt(nop));
      acc.night.push(timeIt(night));
      window.__rainForce({ precip: 1, tempC: 5, wind: 0.3 }); acc.rain.push(timeIt(rainF));
      window.__rainForce({ precip: 1, tempC: -5, wind: 0.3 }); acc.snow.push(timeIt(rainF));
    }
    const n = window.__rainDbg().n;
    window.__rainForce(null);
    return { REP, n, W, H, acc };
  });
  const m = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  const base = m(perf.acc.nop);
  const per = (k) => (m(perf.acc[k]) - base) / perf.REP;
  const nightMs = per('night'), rainMs = per('rain'), snowMs = per('snow');
  say(`    ${perf.W}×${perf.H} · 획 ${perf.n} · REP ${perf.REP} · 5판 중앙값`);
  say(`    밤 오버레이 ${nightMs.toFixed(3)}ms · 비 ${rainMs.toFixed(3)}ms · 눈 ${snowMs.toFixed(3)}ms`);
  ok(nightMs > 0.05, '★계기 신뢰 — 자(밤 오버레이) 자체가 잴 만한 값이 나온다(0 이면 아무것도 못 잰다)', `${nightMs.toFixed(3)}ms`);
  ok(rainMs < nightMs, '★★비 한 판이 밤 오버레이보다 싸다', `${(rainMs / Math.max(1e-6, nightMs)).toFixed(2)}배`);
  ok(snowMs < nightMs, '★★비싼 쪽(눈)도 밤 오버레이보다 싸다', `${(snowMs / Math.max(1e-6, nightMs)).toFixed(2)}배`);

  // ══ ⓕ 프레임 짝 비교 — 카드가 이름 지은 식 `(비 vs 맑음) / (맑음 vs 맑음')` ════════
  //   ★같은 자리를 두 층에서 잰다. ⓔ 는 **층 하나의 값**을 재고, 여기선 그 값이 **프레임 전체**
  //     에서 얼마나 보이는지를 잰다 — 사용자가 실제로 겪는 것은 뒤쪽이다.
  //   ⚠분해능을 먼저 밝힌다(족보 80): 이 컨테이너는 소프트웨어 래스터라 한 프레임이 180ms 대다.
  //     0.4ms 짜리 층은 그 안에서 **원리적으로 안 보인다.** 그래서 판정은 "빨라야 한다"가 아니라
  //     **"프레임에서 보이면 안 된다"** 이고, 자는 여기서도 밤 오버레이가 준다:
  //     비가 프레임에 더한 ms 가 밤 오버레이 한 판보다 작아야 한다(둘 다 이 판에서 잰 값).
  say('\n[ⓕ 프레임 짝 비교 — 맑음/비/맑음\' 를 붙여서, 더한 ms 를 밤 오버레이와 잰다]');
  await page.evaluate(() => {
    // 프레임 계기는 제품이 이미 갖고 있다 — `31-m-move.js` 의 루프가 render() 한 판마다
    //   `_gAcc`(누적 ms) 와 `_gN`(장 수)을 올린다. 하네스는 **그 두 값의 차분만** 모은다(제품 무접촉).
    // ★★그런데 그 차분만 보면 **또 죽은 계기다.** 캔버스 2D 는 명령을 미루므로 `render()` 안에서
    //   잰 ms 는 *명령 기록*이고 래스터는 그 밖에서 일어난다 — 1차 판이 그래서 "눈이 프레임에 더한
    //   값 0.00ms"(층 자체는 1.85ms 인데도)를 냈다. ⇒ 프레임마다 `getImageData` 로 **그 프레임의
    //   래스터를 강제**하고 그 시간을 같이 센다. 재는 값 = 기록 + 래스터.
    window.__wxSample = (nFrames) => new Promise((res) => {
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
  const FR = 40;
  const frame = async (f) => { await rain(f); await sleep(250);
    const r = await page.evaluate((k) => window.__wxSample(k), FR);
    return { rec: med(r.rec), ras: med(r.ras), all: med(r.rec) + med(r.ras) }; };
  const FP = [];
  for (let i = 0; i < 3; i++) {
    const A = await frame({ precip: 0 });
    const N = await frame({ precip: 1, tempC: -5, wind: 0.3 });   // 비싼 쪽(눈)으로 잰다
    const B = await frame({ precip: 0 });
    const a = A.all, rn = N.all, b = B.all;
    FP.push({ a, rn, b, rW: rn / a, rN: b / a });
    say(`    R${i + 1}: 맑음 ${a.toFixed(2)}ms(기록 ${A.rec.toFixed(2)} + 래스터 ${A.ras.toFixed(2)})`
      + ` · 눈 ${rn.toFixed(2)}ms(${N.rec.toFixed(2)} + ${N.ras.toFixed(2)})`
      + ` · 맑음' ${b.toFixed(2)}ms → 날씨 ${(rn / a).toFixed(3)} · 잡음 ${(b / a).toFixed(3)}`);
  }
  await rain(null);
  const rW = med(FP.map((x) => x.rW)), rN = med(FP.map((x) => x.rN)), frameMs = med(FP.map((x) => x.a));
  const addMs = (rW - 1) * frameMs, noiseMs = Math.max(...FP.map((x) => Math.abs(x.rN - 1))) * frameMs;
  say(`    한 장 ${frameMs.toFixed(1)}ms · 날씨가 더한 값 ${addMs.toFixed(2)}ms · 같은 조건 잡음 폭 ±${noiseMs.toFixed(2)}ms`);
  say(`    [참고 — 판정 아님] 비율의 비율 ${(Math.abs(rW - 1) / Math.max(1e-6, Math.abs(rN - 1))).toFixed(2)}` +
      ` · 이 기계의 한 장 ${frameMs.toFixed(2)}ms = 60fps 예산의 ${(frameMs / (1000 / 60) * 100).toFixed(0)}%`);
  // ★계기가 살아 있는지 먼저 본다: ⓔ 가 잰 층의 값을 프레임이 **적어도 절반은** 봐야 한다.
  //   못 보면 판정이 아니라 **유보**다("안 비쌌다"와 "못 쟀다"는 다른 말이다).
  const seen = addMs / Math.max(1e-6, snowMs);
  if (seen < 0.5) {
    fail++; say(`  ✗ ★★유보 — 프레임 계기가 층을 못 본다(층 ${snowMs.toFixed(2)}ms 인데 프레임엔 ${addMs.toFixed(2)}ms).`
      + ' 캔버스 미룸을 다 못 걷었다는 뜻이라 이 절의 어떤 값도 못 믿는다.');
  } else {
    ok(true, '★계기 신뢰 — 프레임이 층의 값을 실제로 본다(층 대비)', `${(seen * 100).toFixed(0)}%`);
    ok(addMs < nightMs, '★★날씨가 프레임에 더한 ms 가 밤 오버레이 한 판보다 작다(같은 판에서 잰 두 값)',
       `${addMs.toFixed(2)}ms < ${nightMs.toFixed(2)}ms`);
    ok(addMs < frameMs * 0.25, '★프레임 한 장에서 날씨가 차지하는 몫이 1/4 아래',
       `${(addMs / frameMs * 100).toFixed(0)}% · 같은 조건 잡음 폭 ±${(noiseMs / frameMs * 100).toFixed(0)}%`);
  }

  say(`\n=== PASS ${pass} / FAIL ${fail} ===`);
  if (errs.length) say(`  [pageerror] ${errs.slice(0, 3).join(' | ')}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
