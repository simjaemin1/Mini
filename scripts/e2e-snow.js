#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 세 밤 분할(T238) · `run-regress.sh --list "nightly C"`
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`page.screenshot` → `PNG.sync.read`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`·지면 굽기)을 만지는 카드는 이 표를 전수로 돌려라.
// =============================================================================
// e2e-snow — 적설이 땅에 보이는가 [T487 2026-09-28]
//   재민 실기 09-28: *"지금 겨울에도 전혀 티가 안 나서 겨울인지 직관적으로 안 느껴진다"*
//   카드 ② "지면 타일 색이 snow 를 읽어 흰빛으로 섞는다 · 픽셀 하네스 눈 0/1 두 장"
//   카드 검증 "끔 바이트 동일(스냅 · 픽셀 하네스 0 판)"
//
// ★판은 둘이다 — 존을 **두 번** 띄운다(손잡이는 환경변수라 한 존 안에선 못 뒤집는다):
//   끔 판  `T487_SNOW` 없음      → 스냅에 `snow` 칸 0 · 지면 한 장(OFF)
//   켬 판  `T487_SNOW=1`         → 스냅에 칸 하나 · 적설 0 한 장(ON0) · 적설 1 한 장(ON1)
//   같은 DB · 같은 날(여름 한가운데 낮 — 나무 철 판이 안 끼게) · 같은 자리(텔레포트 좌표를 첫 판이 정해 둘째가 그대로 쓴다).
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같이 잰다:
//   ⓐ 0 판 = 끔(바이트 동일)      ↔ 반례: 같은 상자에서 적설 1 은 **크게** 다르다
//   ⓑ 눈이 땅을 희게 한다          ↔ 반례: 길을 깐 상자는 거의 안 변한다(제외 규칙이 실제로 산다)
//   ⓒ 되돌리면 그대로 돌아온다     ↔ 결정론(같은 적설 두 프레임 동일)
//   ④ 배지 ℃ 한 칸                  ↔ 끔 판 본문엔 ℃ 가 없다 · 영하는 `−`(U+2212)
//
// ★세우는 문은 테스트 전용 둘뿐이다: `__e2e_clock`(날짜) · `__e2e_snow`(적설 — E2E_GIVE 에서만 있는 분기).
//   세계 값(곡선)은 `test-snow` 가 표로 잰다 — 여기는 **그림**만 잰다.
//
// 사용: node scripts/e2e-snow.js        (산출: $SHOTS/snow-0.png · snow-1.png · off.png)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');     // ★T344 기동 기다리기 정본(사본 0)
const FX = require('./fixture-clock');    // ★T140 시계·입장·마을 기다리기 정본(사본 0)
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/e2e-snow';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-snow-${process.pid}.db`;
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(ZDB + s); } catch (e) { } } };
// ★하늘 시계를 한낮에 묶는다(e2e-tilestate 래퍼와 같은 문법) — 두 판 사이에 해가 기울면 0 판 비교가 거짓말을 한다.
const WRAP = `/tmp/zone-wrap-snow-${process.pid}.js`;
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
require(path.join(ROOT,'server','zone.js'));`);

const lum = (r, g, b) => r * 0.30 + g * 0.59 + b * 0.11;
function meanAbsDiff(a, b, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * a.width + x) * 4;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  }
  return n ? s / n / 3 : 0;
}
function meanLum(p, box) {
  const [x0, y0, x1, y1] = box; let s = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * p.width + x) * 4; s += lum(p.data[i], p.data[i + 1], p.data[i + 2]); n++; }
  return n ? s / n : 0;
}
// 세계 리터럴 `ICE_COLOR`(00-const.js) — 소스에서 읽는다(여기 옮겨 적지 않는다)
const ICE = (() => { const m = fs.readFileSync(path.join(ROOT, 'public', 'client', '00-const.js'), 'utf8').match(/const ICE_COLOR = '#([0-9a-f]{6})'/i);
  return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : null; })();

async function enter(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => say('  [클라 오류] ' + String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  // ★[T84] 로비 버튼은 **id** 로 집는다 · 살아나고 손잡이가 걸린 뒤에 누른다(e2e-tilestate 와 같은 기다림)
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
  const w = await FX.waitInWorld(page);
  // 잡음 걷기 — 바람(풀 카펫 흔들림)·하늘(비·눈 획). 재는 것은 **지면 색**이다(T98 §4-c · T104 ⑤d).
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
  return { page, inWorld: w.ok };
}
const grab = async (page, n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
// 화면이 설 때까지(카메라 트윈·타일 굽기) — 두 장이 **재는 상자들에서** 같아질 때까지 본다.
//   ⚠전화면으로 재지 않는다: 물 셰이더는 늘 흐르고(물가 자리에서 영영 안 선다 — 1판 실측), 재는 것은 지면 상자뿐이다.
async function still(page, boxes, tag) {
  for (let i = 0; i < 30; i++) {
    await sleep(700);
    const a = await grab(page, `zz-${tag}-a`), b = await grab(page, `zz-${tag}-b`);
    if (boxes.every((bx) => meanAbsDiff(a, b, bx) === 0)) return true;
  }
  return false;
}
// 상자 속이 **보이는 땅**인가 — 시야 밖(검정)이면 잴 것이 없다(자명 통과 방지 · 보이는 화소 몫)
function seenFrac(p, box) {
  const [x0, y0, x1, y1] = box; let n = 0, t = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * p.width + x) * 4; t++; if (lum(p.data[i], p.data[i + 1], p.data[i + 2]) > 25) n++; }
  return t ? n / t : 0;
}
async function setSnow(page, v) {
  await page.evaluate((x) => window.__sendPrimary({ type: '__e2e_snow', snow: x }), v);
  for (let i = 0; i < 40; i++) {
    const w = await page.evaluate(() => (window.__wx ? window.__wx() : null));
    if (w && w.snow === v) return w;
    await sleep(500);
    if (i % 6 === 5) await page.evaluate((x) => window.__sendPrimary({ type: '__e2e_snow', snow: x }), v);
  }
  return page.evaluate(() => (window.__wx ? window.__wx() : null));
}
// 날씨 배지 본문(글자 마디) — 툴팁이 아니라 **화면에 보이는 글자**
const badgeText = (page) => page.evaluate(() => { const el = document.getElementById('wxBadge'); return el ? el.textContent.trim() : null; });
const warp = async (page, x, y) => { await page.evaluate(([a, b]) => window.__sendPrimary({ type: 'teleport_debug', x: a, y: b }), [x, y]); await sleep(1500); };
const boxOf = async (page, cells) => {
  const pts = await page.evaluate((cs) => cs.map(([a, b]) => window.__cellScreen(a, b)), cells);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return [Math.round(Math.min(...xs) - 30), Math.round(Math.min(...ys) - 14), Math.round(Math.max(...xs) + 30), Math.round(Math.max(...ys) + 14)];
};
const innerOf = (bx) => { const cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2; return [Math.round(cx - 70), Math.round(cy - 34), Math.round(cx + 70), Math.round(cy + 34)]; };
const patchAt = (c, ox, oy) => { const a = []; for (let d1 = 0; d1 < 5; d1++) for (let d2 = 0; d2 < 5; d2++) a.push([c[0] + ox + d1, c[1] + oy + d2]); return a; };
const OFFS = [[5, -9], [-9, 5], [8, -6], [-6, 8], [11, -3], [-3, 11], [7, 1], [1, 7], [10, -10], [-10, 10], [4, -12], [-12, 4]];

(async () => {
  say('=== 적설 — 땅이 눈을 입는가 (T487) ===');
  const _central = boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _up = await FB.waitUp(_central, /central server up on/, { name: 'central' });
  if (!_up.ok) { say(_up.why); shutdown(); process.exit(1); }
  const ZENV = { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' };
  const DAY = FX.anchorDays().summer;   // 여름 한가운데 — 나무 철 판이 안 끼는 날(econ 곡선이 정한다)
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });

  // ── 끔 판 ────────────────────────────────────────────────────────────────
  say('\n[끔 판 — 손잡이 없음]');
  let z1 = boot('zone', WRAP, ZENV);
  const u1 = await FB.waitUp(z1, /zone server up on/, { name: 'zone(끔)', capMs: 300000 });
  ok(u1.ok, '존 기동(끔)');
  if (!u1.ok) { say(u1.why); await browser.close(); shutdown(); process.exit(1); }
  let E = await enter(browser);
  ok(E.inWorld, '입장(끔)');
  const fx1 = await FX.setClock(E.page, { day: DAY, night: false });
  ok(fx1.ok, `시계를 여름 낮에 세웠다 (day ${DAY} · ${fx1.got ? fx1.got.tempC : '?'}℃)`);
  // 자리 — 마을 밖 맨땅. 마을 좌표에서 멀어지며 **카메라 둘레 뙈기 둘이 전부 뭍**인 첫 자리를 쓴다(좌표를 지어내지 않는다).
  const { rows } = await FX.waitVillages(ZDB);
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`);
  const V = rows[0] || { cx: 1500, cy: 1500 };
  let SPOT = null, G = null, Rd = null;
  outer:
  for (const r of [2400, 4000, 6400, 9600]) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
    const tx = V.cx * 32 + 16 + dx * r, ty = V.cy * 32 + 16 + dy * r;
    if (tx < 400 || ty < 400) continue;
    await warp(E.page, tx, ty);
    await sleep(4000);                                  // 카메라가 닿고 타일이 구워질 틈(정찰 한 장 — 판정 아님)
    const cam = await E.page.evaluate(() => window.__camCellLocal());
    if (!cam) continue;
    const scout = await grab(E.page, 'zz-scout');
    const good = [];
    for (const [ox, oy] of OFFS) {
      const cells = patchAt(cam, ox, oy);
      const kinds = await E.page.evaluate((cs) => cs.map(([a, b]) => { const t = window.__tileStateAt(a, b); return t ? t.kind + (t.road ? 'r' : '') : 'x'; }), cells);
      if (!kinds.every((k) => k === 'land')) continue;
      const bx = await boxOf(E.page, cells);
      if (bx[0] < 70 || bx[2] > 1330 || bx[1] < 260 || bx[3] > 850) continue;
      const sf = seenFrac(scout, innerOf(bx));
      if (sf < 0.98) continue;                          // 시야 밖(검정)이 섞인 뙈기는 잴 것이 없다
      good.push({ ox, oy, cells, sf });
    }
    // 시험·길 뙈기는 서로 **떨어져** 있어야 한다(한쪽 변화가 다른 상자로 번지지 않게 — e2e-tilestate 대조 상자 문법)
    const far = good.length ? good.slice(1).find((c) => Math.abs(c.ox - good[0].ox) + Math.abs(c.oy - good[0].oy) >= 8) : null;
    if (far) { SPOT = [tx, ty]; G = good[0]; Rd = far; break outer; }
  }
  ok(!!SPOT, `맨땅 자리를 잡았다 ${SPOT ? JSON.stringify(SPOT) + ` · 시험 뙈기 ${[G.ox, G.oy]} · 길 뙈기 ${[Rd.ox, Rd.oy]}` : ''}`);
  if (!SPOT) { await browser.close(); shutdown(); process.exit(1); }
  await warp(E.page, SPOT[0], SPOT[1]);
  let BOX = innerOf(await boxOf(E.page, G.cells));
  let RBOX = innerOf(await boxOf(E.page, Rd.cells));
  ok(await still(E.page, [BOX, RBOX], 'off'), '재는 상자 둘이 섰다(끔)');
  BOX = innerOf(await boxOf(E.page, G.cells)); RBOX = innerOf(await boxOf(E.page, Rd.cells));
  const wxOff = await E.page.evaluate(() => (window.__wx ? window.__wx() : null));
  ok(!!wxOff && !('snow' in wxOff), `★끔 판 스냅에 \`snow\` 칸이 **없다** — 칸 ${wxOff ? Object.keys(wxOff).length : 0}개`);
  const OFF = await grab(E.page, 'off');
  const bOff = await badgeText(E.page);
  ok(!!bOff && !/℃/.test(bOff), `④ 끔 판 배지 본문에 ℃ 가 **없다**(종전 글자 그대로) — "${bOff}"`);
  const offKeys = wxOff ? Object.keys(wxOff).sort() : [];
  await E.page.context().close();
  try { z1.kill('SIGKILL'); } catch (e) { }
  await new Promise((r) => { if (z1.exitCode !== null) r(); else z1.once('exit', r); });

  // ── 켬 판 ────────────────────────────────────────────────────────────────
  say('\n[켬 판 — T487_SNOW=1]');
  const z2 = boot('zone', WRAP, { ...ZENV, T487_SNOW: '1' });
  const u2 = await FB.waitUp(z2, /zone server up on/, { name: 'zone(켬)', capMs: 300000 });
  ok(u2.ok, '존 기동(켬)');
  if (!u2.ok) { say(u2.why); await browser.close(); shutdown(); process.exit(1); }
  E = await enter(browser);
  ok(E.inWorld, '입장(켬)');
  const fx2 = await FX.setClock(E.page, { day: DAY, night: false });
  ok(fx2.ok, `같은 날에 세웠다 (day ${DAY})`);
  await warp(E.page, SPOT[0], SPOT[1]);
  const w0 = await setSnow(E.page, 0);
  ok(!!w0 && w0.snow === 0, `적설 0 을 세웠다 — 스냅 snow=${w0 && w0.snow}`);
  const onKeys = w0 ? Object.keys(w0).sort() : [];
  ok(onKeys.length === offKeys.length + 1 && onKeys.filter((k) => k !== 'snow').join() === offKeys.join(),
    `★켬 판 스냅 = 끔 판 칸 + \`snow\` 하나(나머지 칸 이름 동일 · ${offKeys.length}→${onKeys.length})`);
  ok(await still(E.page, [BOX, RBOX], 'on0'), '재는 상자 둘이 섰다(켬 · 적설 0)');
  BOX = innerOf(await boxOf(E.page, G.cells)); RBOX = innerOf(await boxOf(E.page, Rd.cells));
  const ON0 = await grab(E.page, 'snow-0');
  const d00 = meanAbsDiff(OFF, ON0, BOX);
  say(`    끔 ↔ 켬·적설 0  상자 ${JSON.stringify(BOX)}  |Δ| ${d00.toFixed(4)}`);
  ok(d00 === 0, `★★ⓐ **0 판 = 끔** — 같은 자리 같은 날, 지면 화소가 한 톨도 안 다르다 (|Δ| ${d00})`);

  // ④ 배지 ℃ — 켬 판은 본문에 **툴팁의 그 수**가 한 칸 선다(정수 · 여름 낮이라 영상)
  const bOn = await badgeText(E.page);
  const tOn = Math.round(w0.tempC);
  ok(!!bOn && bOn.includes(`${w0.ko} ${tOn}℃`), `★④ 켬 판 배지 본문 = 낱말 + ℃ 한 칸 — "${bOn}"(서버 tempC ${w0.tempC} → ${tOn}℃)`);
  // 길 뙈기 — 방송과 같은 입구(`__roadFeed`)로 답압을 깐다(적설 0 에서 먼저 — 길 그림 자체의 변화를 빼려고)
  const flat = []; for (const [a, b] of Rd.cells) flat.push(a, b, 2);
  await E.page.evaluate((f) => window.__roadFeed(f), flat);
  ok(await still(E.page, [BOX, RBOX], 'on0r'), '재는 상자 둘이 섰다(길 깐 뒤)');
  const road = await E.page.evaluate(([a, b]) => window.__tileStateAt(a, b).road, Rd.cells[12]);
  ok(road > 0, `전제: 길 뙈기가 실제로 길이다 (road=${road})`);
  const ON0r = await grab(E.page, 'snow-0-road');

  const w1 = await setSnow(E.page, 1);
  ok(!!w1 && w1.snow === 1, `적설 1 을 세웠다 — 스냅 snow=${w1 && w1.snow}`);
  ok(await still(E.page, [BOX, RBOX], 'on1'), '재는 상자 둘이 섰다(적설 1)');
  const ON1 = await grab(E.page, 'snow-1');
  const d01 = meanAbsDiff(ON0r, ON1, BOX), L0 = meanLum(ON0r, BOX), L1 = meanLum(ON1, BOX);
  const Lice = ICE ? lum(ICE[0], ICE[1], ICE[2]) : 255;
  say(`    적설 0 → 1  시험 상자 |Δ| ${d01.toFixed(2)} · 휘도 ${L0.toFixed(1)} → ${L1.toFixed(1)} (ICE_COLOR 휘도 ${Lice.toFixed(1)})`);
  ok(ICE !== null, `전제: 세계 리터럴 ICE_COLOR 를 소스에서 읽었다 (${ICE && ICE.join(',')})`);
  ok(L1 > L0 + (Lice - L0) * 0.5, `★★ⓑ 눈이 땅을 **희게** 한다 — 풀빛에서 얼음빛까지의 절반을 넘는다 (${L0.toFixed(1)} → ${L1.toFixed(1)})`);
  const dR = meanAbsDiff(ON0r, ON1, RBOX);
  say(`    길 상자 |Δ| ${dR.toFixed(2)}  (시험 상자 ${d01.toFixed(2)})`);
  ok(dR < d01 / 5, `★★ⓑ 반례 — **길은 눈을 안 입는다**(제외 규칙) · 길 |Δ| ${dR.toFixed(2)} < 시험의 1/5 ${(d01 / 5).toFixed(2)}`);
  const ON1b = await grab(E.page, 'snow-1b');
  ok(meanAbsDiff(ON1, ON1b, BOX) === 0, 'ⓒ 결정론 — 같은 적설 두 프레임이 같다');
  const wb = await setSnow(E.page, 0);
  ok(!!wb && wb.snow === 0, '적설을 0 으로 되돌렸다');
  ok(await still(E.page, [BOX, RBOX], 'back'), '재는 상자 둘이 섰다(되돌림)');
  const BACK = await grab(E.page, 'snow-back');
  const dBack = meanAbsDiff(ON0r, BACK, BOX);
  ok(dBack === 0, `★ⓒ 녹으면 **그대로 돌아온다** — 굽는 그림에 흔적 0 (|Δ| ${dBack})`);

  // ④ 영하 — 겨울 밤(econ 곡선이 정한 겨울 한가운데부터 **밤 기온이 영하인 첫날**)엔 `−`(U+2212) 로 선다
  let WN = FX.anchorDays().winter; while (FX.expectAt(WN, true).tempC >= 0 && WN < FX.anchorDays().winter + 60) WN++;
  const fxN = await FX.setClock(E.page, { day: WN, night: true });
  ok(fxN.ok && fxN.got.tempC < 0, `전제: 겨울 밤 영하에 세웠다 (day ${WN} · ${fxN.got && fxN.got.tempC}℃)`);
  let bN = null;
  for (let i = 0; i < 20; i++) { bN = await badgeText(E.page); if (bN && /−\d+℃/.test(bN)) break; await sleep(500); }
  const tN = fxN.got ? Math.round(fxN.got.tempC) : 0;
  ok(!!bN && bN.includes(`−${-tN}℃`) && !bN.includes('-'), `★④ 영하는 \`−\`(U+2212) 한 칸 — "${bN}"(서버 tempC ${fxN.got && fxN.got.tempC})`);
  // 산출 — 재민 눈용 두 장(적설 0 · 1)
  for (const [src, dst] of [['snow-0', 'T487_지면_적설0'], ['snow-1', 'T487_지면_적설1']]) fs.copyFileSync(`${SHOTS}/${src}.png`, `${SHOTS}/${dst}.png`);
  say(`    그림: ${SHOTS}/T487_지면_적설0.png · T487_지면_적설1.png`);

  await browser.close(); shutdown(); try { fs.unlinkSync(WRAP); } catch (e) { }
  say(`\n=== 적설 지면: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
