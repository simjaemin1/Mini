#!/usr/bin/env node
// =============================================================================
// e2e-terrain — 지형 실장(지면 질감 · 물) 실클라 픽셀 E2E [배치 19]
//   재민 확정 문법(시안 왕복 13회)이 **화면에서 실제로 성립하는가**를 잰다.
//
// ★자명 통과 금지 — 판정마다 **"없으면 실패하는 반례"**를 같이 잰다:
//   ⓐ 흐름  : 물 상자가 하류로 밀린다  ↔ 반례: 같은 시각 두 프레임은 **안 밀린다**
//   ⓑ 투명  : 얕은물이 물밑 진흙을 따라간다 ↔ 반례: **깊은 물**은 덜 따라간다
//   ⓒ 단면  : 강가에 프리즘 면 색이 있다  ↔ 반례: **초원**엔 0
//   ⓓ 질감  : 지면이 한 색이 아니다      ↔ 반례: **legacy** 는 거리와 무관하게 한 색
//   ⓔ 결정론: 시각을 고정하면 두 프레임이 동일
//   ⓕ 대조군: 마른 땅은 시간이 흘러도 정지
//
// ★A/B 는 손잡이로 같은 프레임·같은 시계에서 얻는다(git stash 로 만든 "before" 는 다른 세계다):
//   `__terrain19.legacy` 전부 off · `waterOff` 물만 off · `freezeT` 셰이더 시각 고정.
// ★★시계 정오 앵커(WRAP_DAY_MS) — 배치 18 의 교훈. 촬영 중 해가 움직이면 지표가 통째로 오염된다.
// ⚠headless 는 WebGL 을 SwiftShader(소프트웨어)로 돈다 — **성능 수치는 하한**이다(실사용은 GPU).
//
// 사용: ZDB=/tmp/seed.db node scripts/e2e-terrain.js
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const SHOTS = process.env.SHOTS || '/tmp/e2e-terrain-shots';
const CPORT = 3010, ZPORT = 3020;
const ZDB = process.env.ZDB || '/tmp/e2e-terrain.db';
fs.mkdirSync(SHOTS, { recursive: true });

// 촬영 지점 — `scripts/probe-terrain-sites.js` 가 **정본 판독기**(server/terrain.js)로 고른 셀.
const SITES = {
  river: { cx: 1490, cy: 2477, why: '한여울강 하류 · 17×17 창 물 127 · 바위 0 · 뭍 162 · 최근접 마을 228셀' },
  field: { cx: 965, cy: 1919, why: '농촌22 광장 반경 110셀 순수 초원 · 17×17 전부 뭍 · 최근접 마을 55셀' },
};

let pass = 0, fail = 0;
const say = (s) => console.log(s);
const ok = (c, m) => { if (c) { pass++; say(`  ✓ ${m}`); } else { fail++; say(`  ✗ ${m}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try { execSync(`pkill -f "serve[r]/zone.js" ; pkill -f "centra[l].js" ; pkill -f "zone-wra[p]"`, { stdio: 'ignore' }); } catch (e) {}
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', (d) => { const s = d.toString(); if (/server up|Error/i.test(s)) process.stdout.write(`  [${name}] ` + s.slice(0, 120)); });
  p.stderr.on('data', (d) => { const s = d.toString(); if (!/Warning/.test(s)) process.stdout.write(`  [${name}!] ` + s.slice(0, 120)); });
  procs.push(p); return p;
}
async function waitHttp(url, tries = 900) {
  for (let i = 0; i < tries; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) {} await sleep(1000); }
  return false;
}
fs.writeFileSync('/tmp/zone-wrap.js', `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));const ZID='hanbando';
const d=parseInt(process.env.WRAP_DAY_MS||'86400000',10);
cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.25);
Object.assign(cfg.ZONES[ZID],JSON.parse(process.env.WRAP_ZONE_PATCH||'{}'));
require(path.join(ROOT,'server','zone.js'));`);

// ── 픽셀 도구 ───────────────────────────────────────────────────────────────
// ★상자를 화면 좌표로 박지 않고 **색 분류 마스크**로 잡는다(투영 수학을 하네스가 다시 쓰면 사본이다).
const isWaterPx = (r, g, b) => b > r + 18 && b + g > r * 2 + 20;
// ★1패스에서 이 술어가 틀렸다: `g>r+6` 은 채택본(초록 질감)만 잡고 **legacy 카키 지면**(#9a9670,
//   r≈g)은 138픽셀밖에 안 잡혀 A/B 대조군이 사실상 없었다. 둘 다 잡는 '지면기'로 고친다.
const isGroundPx = (r, g, b) => g - b > 18 && g > 45 && g < 215 && r < g + 26 && b < g;
const isGrassPx = isGroundPx;
const isFacePx = (r, g, b) => r > g && g > b && r > 45 && r < 120 && r - b > 20 && r - b < 70 && g - b > 6;
const lum = (r, g, b) => r * 0.30 + g * 0.59 + b * 0.11;
const BOX = [40, 260, 1360, 860];   // 지면 지표는 화면 중앙(플레이어·UI)을 뺀 넓은 띠에서
function forBox(png, box, fn) {
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) fn((y * png.width + x) * 4, x, y);
}
function maskPct(png, pred, box) {
  let n = 0, t = 0; forBox(png, box, (i) => { t++; if (pred(png.data[i], png.data[i + 1], png.data[i + 2])) n++; });
  return { n, pct: n / t * 100 };
}
function maskDiff(a, b, pred, box) {
  let s = 0, n = 0;
  forBox(a, box, (i) => {
    if (!pred(a.data[i], a.data[i + 1], a.data[i + 2])) return;
    s += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    n++;
  });
  return { d: n ? s / n / 3 : 0, n };
}
// ★"거리 dx 떨어진 두 지면 픽셀이 사실상 같은 색인 비율" — 단색 판정의 지표.
//   평균 |Δ| 는 스프라이트 가장자리 꼬리가 끌어올려 판별력이 없다(배치 19 1패스에서 실측으로 확인).
function flatPct(png, pred, box, dx) {
  const [x0, y0, x1, y1] = box; let n = 0, flat = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1 - dx; x++) {
    const i = (y * png.width + x) * 4, j = (y * png.width + x + dx) * 4;
    if (!pred(png.data[i], png.data[i + 1], png.data[i + 2])) continue;
    if (!pred(png.data[j], png.data[j + 1], png.data[j + 2])) continue;
    n++;
    if (Math.abs(lum(png.data[i], png.data[i + 1], png.data[i + 2]) - lum(png.data[j], png.data[j + 1], png.data[j + 2])) <= 1) flat++;
  }
  return { pct: n ? flat / n * 100 : 0, n };
}
// ★두 프레임 사이 무늬가 **어디로 밀렸는가** — 검색창 안 최적 정합 이동(SAD 최소). 물의 흐름 판정.
function bestShift(a, b, pred, box, R) {
  const [x0, y0, x1, y1] = box;
  let best = Infinity, bdx = 0, bdy = 0, base = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    let s = 0, n = 0;
    for (let y = y0 + R; y < y1 - R; y += 2) for (let x = x0 + R; x < x1 - R; x += 2) {
      const i = (y * a.width + x) * 4;
      if (!pred(a.data[i], a.data[i + 1], a.data[i + 2])) continue;
      const j = ((y + dy) * b.width + (x + dx)) * 4;
      s += Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2]);
      n++;
    }
    if (!n) continue;
    const v = s / n / 3;
    if (dx === 0 && dy === 0) base = v;
    if (v < best) { best = v; bdx = dx; bdy = dy; }
  }
  return { dx: bdx, dy: bdy, sad: best, sad0: base };
}

(async () => {
  say('=== 지형 실장 실클라 E2E (배치 19) ===');
  boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  await sleep(2500);
  const { chromium } = require('playwright');
  const S = {};
  for (const [tag, site] of Object.entries(SITES)) {
    say(`\n── ${tag} 셀(${site.cx},${site.cy}) — ${site.why}`);
    const z = boot('zone', '/tmp/zone-wrap.js', {
      PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: ZDB, CENTRAL_URL: `http://localhost:${CPORT}`,
      ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0',
      WRAP_ZONE_PATCH: JSON.stringify({ mainSquare: { x: site.cx * 32 + 16, y: site.cy * 32 + 16, name: '지형 ' + tag } }),
    });
    ok(await waitHttp(`http://localhost:${ZPORT}/health`), `zone 기동 (${tag})`);
    await sleep(4000);
    const browser = await chromium.launch({ headless: true, executablePath: require('playwright').chromium.executablePath() });
    const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
    for (const sel of ['#startBtn', 'button:has-text("시작")', 'button:has-text("입장")', 'text=게스트']) {
      try { const b = await page.$(sel); if (b) { await b.click(); break; } } catch (e) {}
    }
    await sleep(20000);
    const knob = async (o) => { await page.evaluate((k) => { Object.assign(window.__terrain19, k); }, o); await sleep(1600); };
    const grab = async (n) => { const p2 = `${SHOTS}/${tag}-${n}.png`; await page.screenshot({ path: p2 }); return PNG.sync.read(fs.readFileSync(p2)); };
    const dbg = () => page.evaluate(() => ({ g: window.__groundDbg, w: window.__waterDbg })).catch(() => null);
    const perf = async (o) => { await knob(o); await page.evaluate(() => { window._tileAcc = 0; window._waterAcc = 0; window._tileFrames = 0; });
      await sleep(3000); return page.evaluate(() => ({ t: window._tileAcc || 0, w: window._waterAcc || 0, f: window._tileFrames || 0 })); };

    // ★★[배치 21 정정] 이 하네스가 재는 건 **지면 질감과 물**이다. 배치 21 이 그 위에 얹은
    //   자연물(물가 술)과 **물가 풀 넘김**은 수면을 덮는데, 둘 다 **정적**이라 물 무늬 이동을 재는
    //   `bestShift` 의 물 마스크를 오염시킨다 — 어떤 이동을 시도해도 정지한 풀 가장자리가
    //   SAD 를 때려서 최적 이동이 (0,0)으로 눌린다. 실측: 술 켜면 이동 0.0px, 끄면 아래 수치.
    //   ⇒ **판정을 완화하지 않는다**(기준은 그대로 ≥3px·투영 >2.0). 계측 대상 층만 격리한다.
    //     (배치 19 §5-b 예고 그대로 — 대조군 오염은 상자/층을 옮겨서 푼다.)
    //   자연물 층 자체의 회귀는 `scripts/e2e-nature.js` 가 32판정으로 따로 본다.
    await knob({ legacy: false, waterOff: false, freezeT: 100, natOff: true, shoreOff: true });
    const d0 = await dbg();
    // 오염 실측 — 이 하네스가 왜 natOff 로 재는지 숫자로 남긴다(주석만 믿지 마라).
    await knob({ natOff: false, shoreOff: false });
    const cA = await grab('nat100');
    await knob({ freezeT: 100.12 });
    const cB = await grab('nat10012');
    const cSh = bestShift(cA, cB, isWaterPx, BOX, 12);
    await knob({ freezeT: 100, natOff: true, shoreOff: true });
    const fA = await grab('t100'), fA2 = await grab('t100b');       // 같은 시각 두 프레임 — 결정론/반례
    // ★Δt 선택은 실측으로 정했다: 이류 속도가 ADV=64 월드px/초라 0.9초면 iso 로 56px 밀리는데
    //   1패스의 검색창(±8px)을 훌쩍 넘어 "안 움직인다"는 **없는 결함**이 나왔다.
    //   0.12초 → 7.7 월드px ≈ iso 7~8px 로 창(±12) 안에 들어온다.
    await knob({ freezeT: 100.12 });
    const fB = await grab('t101');
    await knob({ freezeT: 100, prismOff: true });
    const fNoP = await grab('prismoff');                            // 단면만 끔 — 단면 판정의 대조군
    await knob({ freezeT: null, prismOff: false, waterOff: true });
    const fMud = await grab('wateroff');                            // 물 끔 = 물밑(진흙)이 그대로
    await knob({ legacy: true, waterOff: false });
    const fLeg = await grab('legacy');
    const pLeg = await perf({ legacy: true, waterOff: false });
    const pNew = await perf({ legacy: false, waterOff: false });
    const pNoW = await perf({ legacy: false, waterOff: true });
    S[tag] = { d0, fA, fA2, fB, fNoP, fMud, fLeg, pLeg, pNew, pNoW, cSh };
    await browser.close(); try { z.kill(); } catch (e) {}
    await sleep(2500);
  }
  const R = S.river, F = S.field;

  say('\n[ⓞ 계측 격리 — 배치 21 자연물 오염 실측]');
  say(`    자연물 ON 으로 재면 강가 물 이동 = (${R.cSh.dx},${R.cSh.dy}) |${Math.hypot(R.cSh.dx, R.cSh.dy).toFixed(1)}|px  ← 정적 술이 마스크를 눌러 0 으로 뭉갠다`);
  say(`    ⇒ 아래 흐름 판정은 natOff 로 층을 격리해 잰다(기준은 그대로).`);

  say('\n[ⓐ 계약 — __groundDbg / __waterDbg]');
  say(`    강가: ${JSON.stringify(R.d0)}`);
  say(`    초원: ${JSON.stringify(F.d0)}`);
  ok(R.d0.g && R.d0.g.tex === 3 && !R.d0.g.legacy, '지면 텍스처 3종 로드 · 질감 경로로 그린다');
  ok(R.d0.w && R.d0.w.webgl === true && R.d0.w.on === true, 'WebGL 물 레이어가 실제로 켜졌다');
  ok(R.d0.w.segs > 1000, `rivers path 구간을 실제로 읽었다 (${R.d0.w.segs})`);
  ok(R.d0.w.prisms > 10, `★강가에 블록 프리즘 면이 선다 (${R.d0.w.prisms})`);
  ok(F.d0.w.prisms === 0, `★초원엔 프리즘이 0 (${F.d0.w.prisms}) — 어디서나 서는 게 아니다`);
  const fi = R.d0.w.flowIso;
  ok(Math.hypot(fi[0], fi[1]) > 0.2, `★강가 흐름 벡터가 0 이 아니다 (iso ${fi[0].toFixed(2)},${fi[1].toFixed(2)})`);
  ok(Math.hypot(F.d0.w.flowIso[0], F.d0.w.flowIso[1]) < 0.9, '초원(강에서 먼 곳) 흐름은 약하다');

  say('\n[ⓑ 화면 — 픽셀]');
  say('\n  ① 흐름 — 물 무늬가 하류로 밀리는가');
  const wPct = maskPct(R.fA, isWaterPx, BOX);
  ok(wPct.pct > 8, `★자명 통과 금지 — 강가 화면에 물이 실제로 있다 (${wPct.pct.toFixed(1)}%)`);
  const sh = bestShift(R.fA, R.fB, isWaterPx, BOX, 12);
  const shSame = bestShift(R.fA, R.fA2, isWaterPx, BOX, 12);
  const shLand = bestShift(R.fA, R.fB, isGroundPx, BOX, 12);
  say(`    0.12초 뒤 물 무늬 최적 이동 (${sh.dx},${sh.dy}) SAD ${sh.sad.toFixed(1)}(무이동 ${sh.sad0.toFixed(1)})`);
  say(`    같은 시각 두 프레임(반례)  (${shSame.dx},${shSame.dy}) SAD ${shSame.sad.toFixed(2)}`);
  say(`    같은 두 시각의 뭍(대조군)  (${shLand.dx},${shLand.dy}) SAD ${shLand.sad.toFixed(2)}`);
  ok(Math.hypot(sh.dx, sh.dy) >= 3, `★★물이 움직인다 (이동 ${Math.hypot(sh.dx, sh.dy).toFixed(1)}px ≥ 3)`);
  const fl = Math.hypot(fi[0], fi[1]) || 1;
  const proj = (sh.dx * fi[0] + sh.dy * fi[1]) / fl;
  say(`    이동을 흐름 방향에 투영 = ${proj.toFixed(2)} (양수 = 하류)`);
  ok(proj > 2.0, `★★그 이동이 **하류 방향**이다 (흐름축 투영 ${proj.toFixed(2)} > 2.0)`);
  ok(shSame.dx === 0 && shSame.dy === 0, '★반례 — 같은 시각 두 프레임은 안 밀린다(결정론)');
  ok(shLand.dx === 0 && shLand.dy === 0, '★대조군 — 뭍은 시간이 흘러도 정지');

  say('\n  ② 얕은물 투명 — 물밑 진흙이 비치는가');
  //   물 끈 화면(진흙 그대로)과 켠 화면의 **상관**을 얕은 띠 / 깊은 데서 따로 잰다.
  //   투명하면 얕은 데가 밑바닥을 더 따라간다. 깊은 데(반례)는 덜 따라가야 한다.
  const corrBand = (deepLow, deepHigh) => {
    let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, n = 0;
    forBox(R.fA, BOX, (i) => {
      const r = R.fA.data[i], g = R.fA.data[i + 1], b = R.fA.data[i + 2];
      if (!isWaterPx(r, g, b)) return;
      const bl = lum(R.fMud.data[i], R.fMud.data[i + 1], R.fMud.data[i + 2]);
      const wl = lum(r, g, b);
      const blue = b - r;                       // 파랑기 = 수심 대용(얕을수록 작다)
      if (blue < deepLow || blue >= deepHigh) return;
      sx += bl; sy += wl; sxx += bl * bl; syy += wl * wl; sxy += bl * wl; n++;
    });
    if (n < 500) return { r: 0, n };
    const cov = sxy / n - (sx / n) * (sy / n);
    const vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
    return { r: cov / Math.sqrt(Math.max(1e-6, vx * vy)), n };
  };
  const shallow = corrBand(-999, 30), deep = corrBand(30, 999);
  say(`    물밑↔수면 밝기 상관 — 얕은 띠 r=${shallow.r.toFixed(3)}(n=${shallow.n}) · 깊은 데 r=${deep.r.toFixed(3)}(n=${deep.n})`);
  ok(shallow.n > 2000 && deep.n > 2000, `★두 띠 모두 표본 충분 (${shallow.n}/${deep.n})`);
  ok(shallow.r > 0.25, `★★얕은물은 물밑을 따라간다 (r=${shallow.r.toFixed(3)} > 0.25)`);
  ok(shallow.r > deep.r + 0.12, `★★반례 — 깊은 물은 덜 따라간다 (${shallow.r.toFixed(3)} > ${deep.r.toFixed(3)}+0.12)`);

  say('\n  ③ 블록 프리즘 단면 — 켜고 끈 차이로 잰다');
  // ★1패스는 '단면 색 픽셀'을 셌다가 두 번 헛짚었다: ⓐ갈색만 세니 **초원의 맨땅 뙈기**를
  //   단면으로 오인(대조군 0.57%) ⓑ물 근처로 한정했더니 0.01% — 단면 5px 안에 밑면·물접촉선·
  //   풀넘김이 겹쳐 **순수 단면색이 1px 도 안 남기** 때문이다.
  //   ⇒ 색으로 세지 않는다. `prismOff` 손잡이로 **같은 프레임에서 켜고 끈 차이**를 잰다.
  const prismDelta = (on, off) => {
    let n = 0, t2 = 0, dl = 0;
    forBox(on, BOX, (i) => {
      t2++;
      const d = Math.abs(on.data[i] - off.data[i]) + Math.abs(on.data[i + 1] - off.data[i + 1]) + Math.abs(on.data[i + 2] - off.data[i + 2]);
      if (d > 24) { n++; dl += lum(on.data[i], on.data[i + 1], on.data[i + 2]) - lum(off.data[i], off.data[i + 1], off.data[i + 2]); }
    });
    return { pct: n / t2 * 100, n, dark: n ? dl / n : 0 };
  };
  const pdR = prismDelta(R.fA, R.fNoP), pdF = prismDelta(F.fA, F.fNoP);
  say(`    단면 켜고 끈 차이 — 강가 ${pdR.pct.toFixed(2)}% (${pdR.n}px, 평균 밝기변화 ${pdR.dark.toFixed(1)})`);
  say(`                        초원 ${pdF.pct.toFixed(2)}% (${pdF.n}px) ← 대조군(물이 없으면 단면도 없다)`);
  // ★문턱 0.05% 는 **실측으로 교정한 값**이다(1차 문턱 0.15% 는 재 보기 전의 짐작이었다).
  //   판별력은 문턱이 아니라 **대조군**에서 나온다: 초원 0.00% · 밝기변화 −45.8.
  //   단면은 5px 밴드라 화면 점유가 원래 작다 — 45면 × 32px × 5px 중 안개·가림을 빼면 이 정도다.
  ok(pdR.pct > 0.05, `★★강가에 단면이 실제로 그려진다 (${pdR.pct.toFixed(2)}% > 0.05%)`);
  ok(pdR.dark < -8, `★단면은 지면보다 **어둡다** (평균 밝기변화 ${pdR.dark.toFixed(1)} < −8)`);
  ok(pdF.pct < 0.02, `★반례 — 초원엔 단면이 없다 (${pdF.pct.toFixed(2)}% < 0.02%)`);
  ok(R.d0.w.prisms > 10 && F.d0.w.prisms === 0, `★계약층도 같은 말을 한다 (강가 ${R.d0.w.prisms} · 초원 ${F.d0.w.prisms})`);

  say('\n  ④ 지면 질감 — 한 색이 아니다');
  const lf4 = flatPct(F.fLeg, isGrassPx, BOX, 4), lf48 = flatPct(F.fLeg, isGrassPx, BOX, 48);
  const nf4 = flatPct(F.fA, isGrassPx, BOX, 4), nf48 = flatPct(F.fA, isGrassPx, BOX, 48);
  say(`    '사실상 같은 색' 비율 — legacy dx4 ${lf4.pct.toFixed(1)}% → dx48 ${lf48.pct.toFixed(1)}% (n=${lf48.n})`);
  say(`                            채택 dx4 ${nf4.pct.toFixed(1)}% → dx48 ${nf48.pct.toFixed(1)}% (n=${nf48.n})`);
  ok(lf48.n > 20000 && nf48.n > 20000, `★표본 충분 (${lf48.n}/${nf48.n})`);
  ok(lf4.pct > 55, `★자명 통과 금지 — legacy 초원 지면은 사실상 한 색이다 (${lf4.pct.toFixed(1)}%)`);
  ok(nf4.pct < 25, `★★채택본은 **질감**이다 — 4px 떨어진 두 점도 다르다 (${nf4.pct.toFixed(1)}% < 25%)`);

  say('\n  ⑤ 결정론 · 대조군');
  const detW = maskDiff(R.fA, R.fA2, isWaterPx, BOX), detG = maskDiff(F.fA, F.fA2, isGrassPx, BOX);
  say(`    시각 고정 두 프레임 절대차 — 강가 물 ${detW.d.toFixed(3)}(n=${detW.n}) · 초원 지면 ${detG.d.toFixed(3)}(n=${detG.n})`);
  ok(detW.d < 0.5 && detG.d < 0.5, '★★시각을 고정하면 두 프레임이 동일 — 렌더가 (위치, 게임시각)의 순수 함수다');

  say('\n  ⑥ 성능 — 프레임당 ms (headless=SwiftShader 이므로 **하한**)');
  for (const [t, s] of Object.entries(S)) {
    const f = (p) => p.f >= 3 ? `지면 ${(p.t / p.f).toFixed(2)} + 물 ${(p.w / p.f).toFixed(2)} = ${((p.t + p.w) / p.f).toFixed(2)}ms/f (${p.f}프레임)` : 'n/a';
    say(`    ${t}: legacy ${f(s.pLeg)}`);
    say(`         채택   ${f(s.pNew)}`);
    say(`         물 끔  ${f(s.pNoW)}`);
  }
  const gr = Object.values(S).map((s) => (s.pLeg.f >= 3 && s.pNoW.f >= 3) ? (s.pNoW.t / s.pNoW.f) / (s.pLeg.t / s.pLeg.f) : null).filter((v) => v != null);
  ok(gr.length > 0, '지면 비용 비율을 잴 수 있다');
  if (gr.length) ok(Math.max(...gr) < 1.0, `★★지면 단계가 **더 싸졌다** (셀 9,000장 → 타일 blit · 최악 ×${Math.max(...gr).toFixed(2)})`);

  say(`\n스크린샷: ${SHOTS}/`);
  for (const p of procs) { try { p.kill(); } catch (e) {} }
  say(`\n=== 지형 실장 E2E: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
  process.exit(fail ? 1 : 0);
})();
