#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @nightly C   ← 야간 세 밤 분할(T238) · `run-regress.sh --list "nightly C"`
// @pixel    ← ★[T104] **프레임을 화소로 잰다**(`page.screenshot` → `PNG.sync.read`).
//              렌더 층(`3x-r*`·`34-m-renderloop`·`37-r1-*`·지면 굽기)을 만지는 카드는 이 표를 전수로 돌려라.
// =============================================================================
// e2e-frost — 서리가 아침 땅에 보이고, 첫 낮에 사라지는가 [T500 ③ 2026-09-28]
//   카드 ③ "밤 tempC < 0 ∧ snow = 0 인 아침 지면 흰 기미(적설 색의 낮은 값 · T487 ICE_COLOR 문법 · 첫 낮에 사라짐)"
//   카드 검증 "손잡이 `T500_WINTER_FX`(기본 끔 · 끔 = 화소 동일)"
//
// ★판은 둘이다 — 존을 **두 번** 띄운다(손잡이는 환경변수라 한 존 안에선 못 뒤집는다):
//   끔 판 `T500_WINTER_FX` 없음 → 스냅에 `frost` 칸 0      켬 판 `T500_WINTER_FX=1` → 칸 하나
//   같은 DB · 같은 자리 · **같은 하늘 위상** P₀(래퍼가 멈춘다) · 날은 셋:
//     Z = 여름 한가운데(서리 0) · ON = 서리가 P₀ 에 **아직 남은** 맑은 아침 · MELT = 서리가 P₀ 전에 **이미 녹은** 맑은 아침
//   ★P₀ 는 지어내지 않는다 — 첫 겨울 맑은 서리 아침들의 **녹는 때 중앙값**이다(그래야 ON·MELT 가 다 있다).
//
// ★자명 통과 금지 — 판정마다 **없으면 떨어질 반례**를 같이 잰다:
//   ⓐ 서리 0 = 끔(바이트 동일)        ↔ 반례: 같은 상자에서 서리 아침은 **다르다**
//   ⓑ 서리가 땅을 희게 한다(낮은 값)   ↔ 반례: 길 뙈기는 거의 안 변한다(제외 규칙이 실제로 산다)
//   ⓒ 녹은 아침 = 서리 0 판(흔적 0)    ↔ 그날 F₀ 는 0 이 아니다(녹았다 · 없었던 게 아니다)
//   ⓓ 한 경로 채움은 이음새 0          ↔ 반례: 칸마다 칠한 판(1판 · 적설 문법)은 이음새가 선다
//
// ★세우는 문은 테스트 전용 하나뿐이다: `__e2e_clock`(날짜 · E2E_GIVE). 서리 값은 세계 식 그대로다(세우는 문 0).
//
// 사용: node scripts/e2e-frost.js        (산출: $SHOTS/frost-*.png)
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const FB = require('./fixture-boot');     // ★T344 기동 기다리기 정본(사본 0)
const FX = require('./fixture-clock');    // ★T140 시계·입장·마을 기다리기 정본(사본 0)
const GR = require('./fixture-ground');   // ★[T500] 지면 화소 도구(e2e-snow 문법)
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const Wx = require(path.join(ROOT, 'server', 'weather.js'));
const Snow = require(path.join(ROOT, 'server', 'snow.js'));
const SHOTS = process.env.SHOTS || '/tmp/e2e-frost';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || `/tmp/e2e-frost-${process.pid}.db`;
fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = GR.sleep;
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 110)); });
  procs.push(p); return p;
}
const shutdown = () => { for (const p of procs) { try { p.kill('SIGKILL'); } catch (e) { } }
  for (const f of [ZDB, `/tmp/e2e-frost-c-${process.pid}.db`]) for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(f + s); } catch (e) { } } };

// ── 날과 하늘 위상 — 정본 세계에서 규칙으로 뽑는다 ──
const A = FX.anchorDays();
const CAND = [];   // 첫 겨울 둘레의 **맑은** 서리 아침(그날 강수 0) — 빗줄기가 땅을 가리지 않는 아침
for (let n = A.winter - 91; n < A.winter + 91; n++) {
  const f = Snow.frostOf(n), m = n + 1;
  if (f > 0 && !(Wx.precipAt(m) > 0) && Snow.meltOf(m) > 0) CAND.push({ m, f, melt: f / Snow.meltOf(m) });
}
const byMelt = CAND.slice().sort((a, b) => a.melt - b.melt);
const P0 = byMelt.length ? +byMelt[byMelt.length >> 1].melt.toFixed(4) : 0.04;   // 녹는 때 중앙값(그 아침은 경계라 안 쓴다)
const upper = byMelt.filter((c) => c.melt > P0), lower = byMelt.filter((c) => c.melt < P0);
const D_ON = upper.length ? upper[upper.length >> 1] : null;     // P₀ 에 아직 남은 아침(윗반의 가운데)
const D_MELT = lower.length ? lower[lower.length >> 1] : null;   // P₀ 전에 이미 녹은 아침(아랫반의 가운데)
const D_ZERO = A.summer;
// 하늘 시계를 P₀ 에 묶는다(e2e-snow 래퍼와 같은 문법 · 하루 = 실시간 하루) — 두 판이 같은 빛·같은 서리 위상이어야 한다
const WRAP = `/tmp/zone-wrap-frost-${process.pid}.js`;
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*${P0});
require(path.join(ROOT,'server','zone.js'));`);
// 한 장 찍어 화소로 읽는다 — 스크린샷은 **이 하네스가** 찍는다(`@pixel` 표의 증인 · 린트 ⑤c)
const grab = async (page, n) => { const p2 = `${SHOTS}/${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
const ICE = GR.iceColor(ROOT);

async function enter(browser) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  page.on('pageerror', (e) => say('  [클라 오류] ' + String(e.message).slice(0, 160)));
  await page.goto(`http://localhost:${CPORT}/`);
  // ★[T84] 로비 버튼은 **id** 로 집는다 · 살아나고 손잡이가 걸린 뒤에 누른다
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 90000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) { }
  const w = await FX.waitInWorld(page);
  // 잡음 걷기 — 바람(풀 카펫 흔들림)·하늘(비·눈 획). 재는 것은 **지면 색**이다(T98 §4-c · T104 ⑤d).
  await page.evaluate(() => { window.__terrain19.windOff = true; });
  await page.waitForFunction(() => typeof window.__rainForce === 'function', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); });
  return { page, inWorld: w.ok };
}
const wx = (page) => page.evaluate(() => (window.__wx ? window.__wx() : null));

(async () => {
  say('=== 서리 — 언 밤 뒤 아침 땅에 흰 기미가 서고, 첫 낮에 사라지는가 (T500 ③) ===');
  say(`    하늘 위상 P₀ = ${P0}(맑은 서리 아침 ${CAND.length}개의 녹는 때 중앙값 · 실시간 ${(P0 * 24).toFixed(2)}분 = 해 뜨고 ${(P0 * 24 * 60).toFixed(0)}게임분)`);
  say(`    ON = ${D_ON && `${D_ON.m}일 아침(F₀ ${D_ON.f.toFixed(4)} · 녹는 때 ${D_ON.melt.toFixed(4)})`} · MELT = ${D_MELT && `${D_MELT.m}일 아침(F₀ ${D_MELT.f.toFixed(4)} · 녹는 때 ${D_MELT.melt.toFixed(4)})`} · Z = ${D_ZERO}일(여름 한가운데)`);
  ok(!!D_ON && !!D_MELT, `전제: P₀ 양쪽에 아침이 다 있다(남은 아침 ${upper.length} · 녹은 아침 ${lower.length})`);
  if (!D_ON || !D_MELT) { process.exit(1); }
  const _central = boot('central', path.join(ROOT, 'server', 'central.js'),
    { PORT: String(CPORT), DB_PATH: `/tmp/e2e-frost-c-${process.pid}.db`, PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const _up = await FB.waitUp(_central, /central server up on/, { name: 'central' });
  if (!_up.ok) { say(_up.why); shutdown(); process.exit(1); }
  const ZENV = { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
    VILLAGE_MAX: '2', ENABLE_BANDITS: '0', ENABLE_ROADS: '0', ENABLE_WILDLIFE: '0', E2E_GIVE: '1' };
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });

  // ── 끔 판 ────────────────────────────────────────────────────────────────
  say('\n[끔 판 — 손잡이 없음]');
  const z1 = boot('zone', WRAP, ZENV);
  const u1 = await FB.waitUp(z1, /zone server up on/, { name: 'zone(끔)', capMs: 300000 });
  ok(u1.ok, '존 기동(끔)');
  if (!u1.ok) { say(u1.why); await browser.close(); shutdown(); process.exit(1); }
  let E = await enter(browser);
  ok(E.inWorld, '입장(끔)');
  const fz = await FX.setClock(E.page, { day: D_ZERO, night: false });
  ok(fz.ok, `시계를 여름 낮에 세웠다 (day ${D_ZERO})`);
  const { rows } = await FX.waitVillages(ZDB);
  ok(rows.length > 0, `마을이 시딩됐다 (${rows.length}곳)`);
  const found = await GR.findLandSpot(E.page, grab, rows[0] || { cx: 1500, cy: 1500 });
  ok(!!found, `맨땅 자리를 잡았다 ${found ? JSON.stringify(found.spot) + ` · 시험 뙈기 ${[found.G.ox, found.G.oy]} · 길 뙈기 ${[found.Rd.ox, found.Rd.oy]}` : ''}`);
  if (!found) { await browser.close(); shutdown(); process.exit(1); }
  const { spot: SPOT, G, Rd } = found;
  await GR.warp(E.page, SPOT[0], SPOT[1]);
  let BOX = GR.innerOf(await GR.boxOf(E.page, G.cells)), RBOX = GR.innerOf(await GR.boxOf(E.page, Rd.cells));
  ok(await GR.still(E.page, grab, [BOX, RBOX], 'off'), '재는 상자 둘이 섰다(끔)');
  BOX = GR.innerOf(await GR.boxOf(E.page, G.cells)); RBOX = GR.innerOf(await GR.boxOf(E.page, Rd.cells));
  const wxOff = await wx(E.page);
  ok(!!wxOff && !('frost' in wxOff), `★끔 판 스냅에 \`frost\` 칸이 **없다** — 칸 ${wxOff ? Object.keys(wxOff).length : 0}개`);
  const offKeys = wxOff ? Object.keys(wxOff).sort() : [];
  const OFF = await grab(E.page, 'off-z');
  const fo = await FX.setClock(E.page, { day: D_ON.m, night: false });
  ok(fo.ok, `끔 판도 서리 아침에 세웠다 (day ${D_ON.m})`);
  ok(await GR.still(E.page, grab, [BOX], 'off-on'), '재는 상자가 섰다(끔 · 서리 아침)');
  const OFFon = await grab(E.page, 'off-on');
  const dOffDays = GR.meanAbsDiff(OFF, OFFon, BOX);
  ok(dOffDays === 0, `★전제: 끔 판은 날이 바뀌어도 땅이 **그대로**다(여름 ↔ 서리 아침 |Δ| ${dOffDays}) — 끔 = 종전 그림`);
  await E.page.context().close();
  try { z1.kill('SIGKILL'); } catch (e) { }
  await new Promise((r) => { if (z1.exitCode !== null) r(); else z1.once('exit', r); });

  // ── 켬 판 ────────────────────────────────────────────────────────────────
  say('\n[켬 판 — T500_WINTER_FX=1]');
  const z2 = boot('zone', WRAP, { ...ZENV, T500_WINTER_FX: '1' });
  const u2 = await FB.waitUp(z2, /zone server up on/, { name: 'zone(켬)', capMs: 300000 });
  ok(u2.ok, '존 기동(켬)');
  if (!u2.ok) { say(u2.why); await browser.close(); shutdown(); process.exit(1); }
  E = await enter(browser);
  ok(E.inWorld, '입장(켬)');
  const f2 = await FX.setClock(E.page, { day: D_ZERO, night: false });
  ok(f2.ok, `같은 여름 낮에 세웠다 (day ${D_ZERO})`);
  await GR.warp(E.page, SPOT[0], SPOT[1]);
  const w0 = await wx(E.page);
  const onKeys = w0 ? Object.keys(w0).sort() : [];
  ok(!!w0 && w0.frost === 0, `여름 낮 서리 = 0 (스냅 frost=${w0 && w0.frost})`);
  ok(onKeys.length === offKeys.length + 1 && onKeys.filter((k) => k !== 'frost').join() === offKeys.join(),
    `★켬 판 스냅 = 끔 판 칸 + \`frost\` 하나(나머지 칸 이름 동일 · ${offKeys.length}→${onKeys.length})`);
  ok(await GR.still(E.page, grab, [BOX, RBOX], 'on0'), '재는 상자 둘이 섰다(켬 · 서리 0)');
  BOX = GR.innerOf(await GR.boxOf(E.page, G.cells)); RBOX = GR.innerOf(await GR.boxOf(E.page, Rd.cells));
  const ON0 = await grab(E.page, 'frost-0');
  const d00 = GR.meanAbsDiff(OFF, ON0, BOX);
  say(`    끔 ↔ 켬·서리 0  상자 ${JSON.stringify(BOX)}  |Δ| ${d00.toFixed(4)}`);
  ok(d00 === 0, `★★ⓐ **서리 0 판 = 끔** — 같은 자리 같은 날, 지면 화소가 한 톨도 안 다르다 (|Δ| ${d00})`);
  // 길 뙈기 — 방송과 같은 입구(`__roadFeed`)로 답압을 깐다(서리 0 에서 먼저 — 길 그림 자체의 변화를 빼려고)
  const flat = []; for (const [a, b] of Rd.cells) flat.push(a, b, 2);
  await E.page.evaluate((f) => window.__roadFeed(f), flat);
  ok(await GR.still(E.page, grab, [BOX, RBOX], 'on0r'), '재는 상자 둘이 섰다(길 깐 뒤)');
  const road = await E.page.evaluate(([a, b]) => window.__tileStateAt(a, b).road, Rd.cells[12]);
  ok(road > 0, `전제: 길 뙈기가 실제로 길이다 (road=${road})`);
  const ON0r = await grab(E.page, 'frost-0-road');

  // ⓑ 서리 아침
  const fOn = await FX.setClock(E.page, { day: D_ON.m, night: false });
  const want = Snow.frostAt(D_ON.m, false, P0);
  const w1 = await wx(E.page);
  ok(fOn.ok && !!w1 && Math.abs(w1.frost - want) < 1e-9 && w1.frost > 0,
    `서리 아침에 세웠다 — 스냅 frost ${w1 && w1.frost} = 세계 식 frostAt(${D_ON.m}, 낮, P₀) ${want}`);
  ok(await GR.still(E.page, grab, [BOX, RBOX], 'on1'), '재는 상자 둘이 섰다(서리 아침)');
  const ON1 = await grab(E.page, 'frost-1');
  const L0 = GR.meanLum(ON0r, BOX), L1 = GR.meanLum(ON1, BOX), Li = ICE ? GR.lum(ICE[0], ICE[1], ICE[2]) : 255;
  const wFrac = (L1 - L0) / Math.max(1e-9, Li - L0);
  say(`    서리 0 → ${w1.frost}  시험 상자 휘도 ${L0.toFixed(1)} → ${L1.toFixed(1)} (ICE_COLOR ${Li.toFixed(1)}) · 풀빛→얼음빛 몫 ${wFrac.toFixed(3)}`);
  ok(ICE !== null, `전제: 세계 리터럴 ICE_COLOR 를 소스에서 읽었다 (${ICE && ICE.join(',')})`);
  ok(wFrac > w1.frost / 2, `★★ⓑ 서리가 땅을 **희게** 한다 — 풀빛→얼음빛 몫이 서리 값의 절반을 넘는다 (${wFrac.toFixed(3)} > ${(w1.frost / 2).toFixed(3)})`);
  ok(wFrac < (1 + w1.frost) / 2, `★ⓑ **낮은 값** — 서리와 온 눈(1)의 가운데보다 옅다(눈 한 벌로 안 보인다) (${wFrac.toFixed(3)} < ${((1 + w1.frost) / 2).toFixed(3)})`);
  const dF = GR.meanAbsDiff(ON0r, ON1, BOX), dR = GR.meanAbsDiff(ON0r, ON1, RBOX);
  say(`    길 상자 |Δ| ${dR.toFixed(2)}  (시험 상자 ${dF.toFixed(2)})`);
  ok(dR < dF / 5, `★★ⓑ 반례 — **길은 서리를 안 입는다**(적설과 같은 제외 규칙) · 길 |Δ| ${dR.toFixed(2)} < 시험의 1/5 ${(dF / 5).toFixed(2)}`);
  const ON1b = await grab(E.page, 'frost-1b');
  ok(GR.meanAbsDiff(ON1, ON1b, BOX) === 0, '결정론 — 같은 서리 두 프레임이 같다');

  // ⓓ 이음새 — 격리 캔버스(세계 없이 칠하는 법만 · 같은 서리 값 · 같은 색)
  const seam = await E.page.evaluate(() => {
    const F = _gtFrostNow();
    const Wc = 320, Hc = 192, cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const cells = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) cells.push(Wc / 2 + (i - j) * 32, 40 + (i + j) * 16);
    const base = () => { c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.fillStyle = '#556b2f'; c.fillRect(0, 0, Wc, Hc); };
    const L = (d, x, y) => { const k = (y * Wc + x) * 4; return d[k] * 0.30 + d[k + 1] * 0.59 + d[k + 2] * 0.11; };
    // 안쪽 칸(둘레가 전부 이웃인 칸)의 **맞닿은 변** 위 화소 · 칸 한가운데 화소
    const inner = []; for (let i = 1; i < 4; i++) for (let j = 1; j < 4; j++) inner.push([Wc / 2 + (i - j) * 32, 40 + (i + j) * 16]);
    const edgePts = [], midPts = [];
    for (const [cx, cy] of inner) {
      for (let t = 0.25; t <= 0.75; t += 0.25) {
        edgePts.push([Math.round(cx + t * 32), Math.round(cy - 16 + t * 16)], [Math.round(cx + t * 32), Math.round(cy + 16 - t * 16)],
                     [Math.round(cx - t * 32), Math.round(cy - 16 + t * 16)], [Math.round(cx - t * 32), Math.round(cy + 16 - t * 16)]);
      }
      midPts.push([cx, cy], [cx + 6, cy], [cx - 6, cy], [cx, cy + 3], [cx, cy - 3]);
    }
    const measure = (d) => {
      const mid = midPts.map(([x, y]) => L(d, x, y)), edge = edgePts.map(([x, y]) => L(d, x, y));
      const m = mid.reduce((s, v) => s + v, 0) / mid.length;
      return { mid: +m.toFixed(3), edgeMean: +(edge.reduce((s, v) => s + v, 0) / edge.length).toFixed(3),
               off: edge.filter((v) => v !== mid[0]).length, n: edge.length, midSame: mid.every((v) => v === mid[0]) };
    };
    base(); for (let k = 0; k < cells.length; k += 2) _gtDiamond(c, cells[k], cells[k + 1], ICE_COLOR, F, null);
    const per = measure(c.getImageData(0, 0, Wc, Hc).data);
    base(); _gtFrostPaint(c, null, cells, ICE_COLOR);
    const one = measure(c.getImageData(0, 0, Wc, Hc).data);
    return { F, per, one };
  });
  say(`    이음새(격리 캔버스 · α ${seam.F}): 칸마다 칠함 — 변 휘도 ${seam.per.edgeMean} vs 가운데 ${seam.per.mid} · 다른 변 화소 ${seam.per.off}/${seam.per.n}`
    + `  |  경로 하나 — 변 ${seam.one.edgeMean} vs 가운데 ${seam.one.mid} · 다른 변 화소 ${seam.one.off}/${seam.one.n}`);
  ok(seam.per.midSame && seam.one.midSame, '전제: 칸 가운데는 두 판 다 고른 한 색이다(바탕·칠이 균일)');
  ok(seam.per.off > 0 && seam.per.edgeMean < seam.per.mid, `★ⓓ 반례 — **칸마다** 반투명 다이아를 칠하면 맞닿은 변이 어둡다(1판의 격자 · 다른 변 화소 ${seam.per.off}/${seam.per.n})`);
  ok(seam.one.off === 0, `★★ⓓ **경로 하나로 한 번** 칠하면 맞닿은 변이 가운데와 **같은 색**이다(이음새 0 · ${seam.one.off}/${seam.one.n})`);

  // ⓒ 이미 녹은 아침 — 서리 값 0 · 땅은 서리 0 판과 **같다**
  const fM = await FX.setClock(E.page, { day: D_MELT.m, night: false });
  const wM = await wx(E.page);
  ok(fM.ok && !!wM && wM.frost === 0 && Snow.frostOf(D_MELT.m - 1) > 0,
    `녹은 아침에 세웠다 — 그 밤 F₀ ${Snow.frostOf(D_MELT.m - 1).toFixed(4)} 인데 P₀ 에 스냅 frost ${wM && wM.frost}(녹는 때 ${D_MELT.melt.toFixed(4)} < P₀ ${P0})`);
  ok(await GR.still(E.page, grab, [BOX, RBOX], 'onM'), '재는 상자 둘이 섰다(녹은 아침)');
  const ONM = await grab(E.page, 'frost-melted');
  const dM = GR.meanAbsDiff(ON0r, ONM, BOX);
  ok(dM === 0, `★★ⓒ **첫 낮에 사라진다** — 녹은 아침의 땅 = 서리 0 판(굽는 그림에 흔적 0 · |Δ| ${dM})`);
  for (const [src, dst] of [['frost-0-road', 'T500_서리0'], ['frost-1', 'T500_서리아침']]) fs.copyFileSync(`${SHOTS}/${src}.png`, `${SHOTS}/${dst}.png`);
  say(`    그림: ${SHOTS}/T500_서리0.png · T500_서리아침.png`);

  await browser.close(); shutdown(); try { fs.unlinkSync(WRAP); } catch (e) { }
  say(`\n=== 서리 지면: 통과 ${pass} · 실패 ${fail} ===`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); shutdown(); process.exit(1); });
