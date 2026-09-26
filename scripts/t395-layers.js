#!/usr/bin/env node
// === scripts/t395-layers.js — 클라 프레임의 주인: 층별 ms (T395 ①②) ==================
//
// ★계측기다 — 러너 밖(`@regress` 없음 · 화소를 안 읽으니 `@pixel` 도 아니다). **제품은 한 글자도 안 바뀐다.**
//   층 시계는 **브라우저 안에서** 붙인다: `34-m-renderloop.js` 원문을 fetch 해 `render()` 본문만 떼어,
//   그리기 순서의 경계 열다섯 곳(주석·표식 줄 — 전부 본문에 **한 번만** 나온다 · 둘이면 멈춘다) 앞에
//   `__L(i)` 한 줄을 넣고 `window.render` 로 다시 건다(T384 가 `render` 를 감싼 그 문 · 31-m-move 는 이름으로 부른다).
//   ⇒ 같은 설치기가 **어느 브라우저에서도** 돈다(헤드리스 크로미움 · 맥 GPU 크로미움 — `INSTALL` 문자열 하나).
//   그리는 것은 한 획도 안 바뀐다 — 넣는 것은 `performance.now()` 뿐이다.
//
// ★자리 셋은 T384 와 같다: 숲 한복판(임업3) · 마을(농촌2) · 빈 초지(어촌1 동 2,500).
// 실행: node scripts/t395-layers.js [--frames 90]
//       node scripts/t395-layers.js --print-install     ← 다른 브라우저에 붙일 설치기 문자열만 찍는다
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

// ── 경계 표 — **그리기 순서 그대로**(34-m-renderloop.js). 이름은 "이 표식에서 끝나는 구간"이다. ─────────
const ANCHORS = [
  ['카메라·준비',            '// === 1) 지면 다이아몬드 타일 ===', 'before'],
  ['① 지면 타일',            '// === 1-b) 물 레이어', 'before'],
  ['①b 물·프리즘',           '// === 2) 엔티티 수집', 'before'],
  ['② 엔티티 수집',          '// ★★[배치 21 수리] 자연물(물가 술·들꽃)은 **안개 마스크보다 먼저** 그린다.', 'before'],
  ['자연물(_natDraw)',       '// ★[T380] 원경 나무 층', 'before'],
  ['원경 띠(38-fartree)',    '// 3단계 안개 마스크(', 'before'],
  ['안개 마스크 합성',       "_mtStage(ctx, 'B_안개후');", 'after'],
  ['안개 게이트·정렬',       '// === 3) 엔티티 그리기 ===', 'before'],
  ['③ 엔티티 그리기',        "_mtStage(ctx, 'D_루프후');", 'after'],
  ['흐림 후처리',            '// === 14.49-e7o:', 'before'],
  ['④c 가시성 폴리곤(마스크 굽기)', '// === Phase 5-I: 화살 발사체', 'before'],
  ['화살 발사체',            '// === 4-0) 날씨(비·눈)', 'before'],
  ['④0 날씨(37-weather)',    '// === 4-1) 밤 어두움', 'before'],
  ['④1 밤 오버레이',         '// === Phase 4d-4: 캐나디아', 'before'],
  ['작업장·캐러밴 표시',     '// === 5) 인접 존 방향 화살표', 'before'],
];
const TAIL = '⑤ 화살표·지시자(끝)';
const OUTSIDE = ['drawArrowFx', 'drawBuildOverlay', 'drawPlacementGhost', 'zoomEnd', 'updateBuildProgressEl', 'updateMinimap'];

// ── 브라우저에 붙이는 설치기(문자열 — 어느 브라우저에서나 같은 것) ──────────────────────────────
const INSTALL = `(async () => {
  if (window.__t395) return 'already';
  const ANCHORS = ${JSON.stringify(ANCHORS)}, TAIL = ${JSON.stringify(TAIL)}, OUTSIDE = ${JSON.stringify(OUTSIDE)};
  const src = await (await fetch(document.querySelector('script[src*="34-m-renderloop.js"]').src)).text();
  const i = src.indexOf('  function render() {');
  if (i < 0) throw new Error('render 본문을 못 찾았다');
  let d = 0, j = src.indexOf('{', i), e = -1;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) { e = k; break; } } }
  let body = src.slice(i, e + 1);
  const missing = [];
  ANCHORS.forEach(([name, a, where], idx) => {
    const n = body.split(a).length - 1;
    if (n !== 1 && window.__t395Loose) { missing.push(name); return; }   // 배포판이 main 보다 옛것이면 그 경계만 비운다
    if (n !== 1) throw new Error('경계가 한 번이 아니다: ' + a + ' (' + n + ')');
    body = body.replace(a, where === 'before' ? ('__L(' + (idx + 1) + ');' + a) : (a + '__L(' + (idx + 1) + ');'));
  });
  body = body.replace('function render() {', 'function render() {__L(0);');
  body = body.slice(0, body.lastIndexOf('}')) + '__L(' + (ANCHORS.length + 1) + ');}';
  const names = ANCHORS.map((x) => x[0]).concat([TAIL]);
  const T = new Float64Array(ANCHORS.length + 2);
  const acc = { frames: 0, seg: names.map(() => []), total: [], outside: {} };
  window.__t395 = acc;
  window.__L = (k) => { T[k] = performance.now(); };
  const orig = window.render;
  const s = document.createElement('script');
  s.textContent = 'window.__t395render = ' + body.replace('function render()', 'function ()') + ';';
  document.head.appendChild(s);
  if (typeof window.__t395render !== 'function') throw new Error('다시 건 render 가 함수가 아니다');
  window.render = function () {
    T.fill(-1);
    const t0 = performance.now(); window.__t395render(); const tot = performance.now() - t0;
    if (!acc.on) return;
    acc.frames++; acc.total.push(tot);
    { const w = window.__waterDbg; acc.px.push(w && w.on && w.rect ? w.rect[2] * w.rect[3] : 0); }
    let prev = 0;
    for (let k = 1; k < T.length; k++) { if (T[k] < 0) continue; acc.seg[k - 1].push(T[k] - T[prev]); prev = k; }
  };
  window.render.__orig = orig;
  for (const f of OUTSIDE) {
    const o = window[f]; if (typeof o !== 'function') continue;
    acc.outside[f] = [];
    window[f] = function () { const t = performance.now(); const r = o.apply(this, arguments); if (acc.on) acc.outside[f].push(performance.now() - t); return r; };
  }
  //   ★갈래 속 갈래 — ①b·② 안의 **GL 경로**와 **JS 경로**를 가른다(전역 함수 선언이라 이름으로 부르는 자리를 감싼다).
  const SUB = ['_drawWaterLayer', '_buildFlowTex', '_drawPrisms', '_bakeShoreTile', '_mtCollect', '_mt3Bake', '_mt3GlDraw', '_mt3GlBand'];
  acc.sub = {};
  for (const f of SUB) {
    const o = window[f]; if (typeof o !== 'function') continue;
    acc.sub[f] = [];
    window[f] = function () { const t = performance.now(); const r = o.apply(this, arguments); if (acc.on) acc.sub[f].push(performance.now() - t); return r; };
  }
  acc.px = [];
  acc.reset = () => { acc.frames = 0; acc.total.length = 0; acc.seg.forEach((a) => a.length = 0); for (const f in acc.outside) acc.outside[f].length = 0; for (const f in acc.sub) acc.sub[f].length = 0; acc.px.length = 0; };
  acc.names = names;
  acc.summary = () => {
    const q = (a, p) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    return { frames: acc.frames, totMed: q(acc.total, 0.5), totMean: mean(acc.total), totP90: q(acc.total, 0.9),
      seg: names.map((n, k) => ({ n, med: q(acc.seg[k], 0.5), mean: mean(acc.seg[k]), hit: acc.seg[k].length })),
      outside: Object.fromEntries(Object.entries(acc.outside).map(([f, a]) => [f, { med: q(a, 0.5), mean: mean(a), hit: a.length }])),
      sub: Object.fromEntries(Object.entries(acc.sub).map(([f, a]) => [f, { mean: a.reduce((x, y) => x + y, 0) / Math.max(1, acc.frames), calls: a.length }])),
      waterPx: mean(acc.px), mtP: window.__mtDbg ? { bakeMs: window.__mtDbg.mt3bakeMs, bakeN: window.__mtDbg.mt3bakeN } : null,
      canvas: (() => { const c = document.getElementById('canvas'); return c ? [c.width, c.height] : null; })(),
      dpr: window.devicePixelRatio, ua: navigator.userAgent,
      gl: (() => { try { const g = document.createElement('canvas').getContext('webgl'); const x = g && g.getExtension('WEBGL_debug_renderer_info'); return x ? g.getParameter(x.UNMASKED_RENDERER_WEBGL) : (g ? 'webgl(무정보)' : 'webgl 없음'); } catch (e) { return 'err'; } })() };
  };
  acc.missing = missing;
  return 'ok ' + names.length + (missing.length ? ' (빈 경계 ' + missing.join(',') + ')' : '');
})()`;

if (process.argv.includes('--print-install')) { process.stdout.write(INSTALL); process.exit(0); }
// ★재민 몫 한 줄 — **어느 브라우저의 콘솔에나** 붙이면 지금 선 자리에서 90프레임을 재고 표를 찍는다
//   (맥 크로미움 GPU · Safari · 배포판). 제품을 안 바꾼다 — 설치기와 같은 문 · 끝나면 새로고침하면 사라진다.
//   진단 팔(GL 두 층 끔)도 같이 돈다: 두 수가 다 16.7ms 안이면 그 브라우저에서 이 층은 주인이 아니다.
const CONSOLE = `window.__t395Loose = true; (async () => {
  const r = await ${INSTALL};
  const run = async (n) => { __t395.reset(); __t395.on = true; while (__t395.frames < n) await new Promise((q) => requestAnimationFrame(q)); __t395.on = false; return __t395.summary(); };
  const a = await run(90);
  __terrain19.waterOff = true; __terrain19.mt3dOff = true; const b = await run(60); __terrain19.waterOff = false; __terrain19.mt3dOff = false;
  console.log('T395 설치기', r, '· GL', a.gl, '· 캔버스', a.canvas, 'dpr', a.dpr);
  console.table(a.seg.map((x) => ({ 층: x.n, 평균ms: +(x.mean || 0).toFixed(2) })).concat([{ 층: 'render 합', 평균ms: +a.totMean.toFixed(2) }, { 층: '진단 — GL 두 층 끔 render', 평균ms: +b.totMean.toFixed(2) }]));
  console.table(Object.entries(a.sub).map(([k, v]) => ({ 갈래: k, 평균ms: +v.mean.toFixed(2) })));
  return { renderMs: +a.totMean.toFixed(2), glOffMs: +b.totMean.toFixed(2), waterPx: Math.round(a.waterPx), gl: a.gl };
})()`;
if (process.argv.includes('--print-console')) { process.stdout.write(CONSOLE); process.exit(0); }

// ── 컨테이너 상자(헤드리스 크로미움) ─────────────────────────────────────────────────────────────
const FB = require('./fixture-boot');
const CPORT = 3010, ZPORT = 3020;
const FRAMES = +((process.argv.includes('--frames') ? process.argv[process.argv.indexOf('--frames') + 1] : '') || 90);
const PLACES = [
  { name: '숲 한복판(임업3)', x: 57382, y: 61114 },
  { name: '마을(농촌2)', x: 19862, y: 110368 },
  { name: '빈 초지(어촌1 동 2,500)', x: 43964, y: 75424 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function boot(name, file, env) {
  const p = spawn('node', [file], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], cwd: ROOT });
  p.stdout.on('data', () => {}); p.stderr.on('data', () => {});
  procs.push(p); return p;
}
const killAll = () => { for (const p of procs) { try { p.kill(); } catch (e) {} } };
const WRAP = '/tmp/zone-wrap-t395.js';
fs.writeFileSync(WRAP, `const path=require('path');const ROOT=${JSON.stringify(ROOT)};
const cfg=require(path.join(ROOT,'server','zone-config'));
const d=86400000; cfg.WORLD.dayLengthMs=d; cfg.WORLD.worldEpoch=Date.now()-Math.round(d*0.3);
require(path.join(ROOT,'server','zone.js'));`);   // T384 와 같은 한낮 고정(밤 오버레이·날씨가 판마다 안 흔들리게)

(async () => {
  const OUT = process.env.T395_OUT || '/tmp/t395-layers.json';
  const c = boot('central', path.join(ROOT, 'server', 'central.js'), { PORT: String(CPORT), PUBLIC_HOST: 'localhost', ENABLED_ZONES: 'hanbando' });
  const cu = await FB.waitUp(c, /central server up on/, { name: 'central' }); if (!cu.ok) { console.log(cu.why); process.exit(1); }
  const z = boot('zone', WRAP, { PORT: String(ZPORT), ZONE_ID: 'hanbando', DB_PATH: '/tmp/t395-layers.db',
    CENTRAL_URL: `http://localhost:${CPORT}`, ENABLE_VILLAGES: '1', ENABLE_BANDITS: '0' });
  const zu = await FB.waitUp(z, /zone server up on/, { name: 'zone', capMs: 300000 }); if (!zu.ok) { console.log(zu.why); process.exit(1); }
  await sleep(20000);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
  await page.goto(`http://localhost:${CPORT}/`); await sleep(2500);
  await page.waitForFunction(() => { const b = document.getElementById('enter'); return !!(b && b.onclick && !b.disabled); }, { timeout: 45000 }).catch(() => {});
  try { const b = await page.$('#enter'); if (b) await b.click(); } catch (e) {}
  const ok = await page.waitForFunction(() => !!(window._shadowMask && window.__getPrimaryZoneId && window.__getPrimaryZoneId()), { timeout: 90000 }).then(() => true).catch(() => false);
  if (!ok) { console.log('★입장 실패'); killAll(); process.exit(1); }
  await page.evaluate(() => { if (typeof window.__rainForce === 'function') window.__rainForce({ precip: 0 }); if (window.__terrain19) window.__terrain19.windOff = true; });
  console.log('  설치기:', await page.evaluate(INSTALL));
  const rows = [];
  for (const P of PLACES) {
    await page.evaluate(([x, y]) => window.__sendPrimary({ type: 'teleport_debug', x, y }), [P.x, P.y]);
    await sleep(8000);
    await page.evaluate(() => { window.__t395.reset(); window.__t395.on = true; });
    await page.waitForFunction((n) => window.__t395.frames >= n, FRAMES, { timeout: 600000 });
    const s = await page.evaluate(() => { window.__t395.on = false; return window.__t395.summary(); });
    //   진단 팔 — GL 두 층(물 셰이더 · 산 3D)을 **이미 있는 끄는 문**(`__terrain19.waterOff`·`mt3dOff`)으로 끄고 같은 자리를 잰다.
    //   ⚠그림이 달라지는 팔이다(고침이 아니다) — "이 상자에서 GL 을 빼면 프레임이 어디로 가나" 한 줄만 본다.
    await page.evaluate(() => { window.__terrain19.waterOff = true; window.__terrain19.mt3dOff = true; window.__t395.reset(); window.__t395.on = true; });
    await page.waitForFunction((n) => window.__t395.frames >= n, Math.min(FRAMES, 60), { timeout: 600000 });
    const off = await page.evaluate(() => { window.__t395.on = false; window.__terrain19.waterOff = false; window.__terrain19.mt3dOff = false; return window.__t395.summary(); });
    rows.push({ P, s, off });
    console.log(`  · ${P.name}: render 중앙 ${s.totMed.toFixed(1)}ms (평균 ${s.totMean.toFixed(1)} · ${s.frames}프레임) · GL 두 층 끔 ${off.totMed.toFixed(1)}ms`);
  }
  fs.writeFileSync(OUT, JSON.stringify({ box: 'container-headless', rows }, null, 1));
  await browser.close(); killAll();
  printTable(rows);
  process.exit(0);
})().catch((e) => { console.log('★예외 ' + (e && e.stack || e)); killAll(); process.exit(1); });

function printTable(rows) {
  const f = (v) => (v == null ? '-' : (+v).toFixed(2));
  console.log('\n| 층(그리기 순서) | ' + rows.map((r) => r.P.name + ' 평균 ms').join(' | ') + ' |');
  console.log('|---|' + rows.map(() => '---:').join('|') + '|');
  const names = rows[0].s.seg.map((x) => x.n);
  names.forEach((n, k) => console.log(`| ${n} | ` + rows.map((r) => f(r.s.seg[k].mean)).join(' | ') + ' |'));
  console.log(`| **render 합(감싼 값)** | ` + rows.map((r) => f(r.s.totMean)).join(' | ') + ' |');
  console.log(`| 층 합 − render(못 가른 나머지) | ` + rows.map((r) => f(r.s.seg.reduce((a, x) => a + x.mean, 0) - r.s.totMean)).join(' | ') + ' |');
  for (const fn of Object.keys(rows[0].s.outside)) console.log(`| (render 밖) ${fn} | ` + rows.map((r) => f(r.s.outside[fn] && r.s.outside[fn].mean)).join(' | ') + ' |');
  console.log('\n| 갈래 속 갈래(프레임당 평균 ms) | ' + rows.map((r) => r.P.name).join(' | ') + ' |');
  console.log('|---|' + rows.map(() => '---:').join('|') + '|');
  for (const fn of Object.keys(rows[0].s.sub)) console.log(`| ${fn} | ` + rows.map((r) => f(r.s.sub[fn] && r.s.sub[fn].mean)).join(' | ') + ' |');
  console.log(`| 물 셰이더가 칠한 화소(프레임 평균) | ` + rows.map((r) => Math.round(r.s.waterPx).toLocaleString()).join(' | ') + ' |');
  console.log(`| **진단 팔 — GL 두 층 끔 render 중앙 ms** | ` + rows.map((r) => f(r.off && r.off.totMed)).join(' | ') + ' |');
  console.log(`\n  캔버스 ${JSON.stringify(rows[0].s.canvas)} · dpr ${rows[0].s.dpr} · GL ${rows[0].s.gl}`);
}
module.exports = { INSTALL, ANCHORS };
